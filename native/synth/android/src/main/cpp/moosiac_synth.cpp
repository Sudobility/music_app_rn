/**
 * libfluidsynth on Android, driven the way the web drives it.
 *
 * This is the C/C++ core of `@moosiac/synth`'s Android module — the exact
 * counterpart of `apple/MoosiacSynth.mm`. The `fluid_*` calls are the same; the
 * only platform piece is the audio driver, which is Oboe here (AAudio on API
 * 26+, OpenSL ES below) where Apple uses CoreAudio.
 *
 * It is a synth, not a player. `@sudobility/music_player`'s `NativeSynthBackend`
 * and the shared scheduler own the transport; this owns sound and a clock,
 * addressed by (instance, channel) exactly like the web host. The note methods
 * are called synchronously from the audio-scheduling path, so the Kotlin shell
 * marks them `isBlockingSynchronousMethod` and they must not hop a thread.
 *
 * State lives behind an opaque handle (a `Synth*` as a `jlong`) that the Kotlin
 * module holds, so there is one synth pool per module instance and no globals.
 */
#include <jni.h>

#include <cmath>
#include <mutex>
#include <string>
#include <vector>

#include <fluidsynth.h>

namespace {

constexpr int kDrumBank = 128;
constexpr int kStandardKit = 0;
constexpr int kPercussionChannel = 9;

struct Instance {
  fluid_settings_t *settings = nullptr;
  fluid_synth_t *synth = nullptr;
  fluid_audio_driver_t *driver = nullptr;
  fluid_sequencer_t *sequencer = nullptr;
  fluid_seq_id_t destination = -1;
  int sfontId = -1;
};

void destroyInstance(Instance &instance) {
  if (instance.sequencer) {
    delete_fluid_sequencer(instance.sequencer);
  }
  if (instance.driver) {
    delete_fluid_audio_driver(instance.driver);
  }
  if (instance.synth) {
    delete_fluid_synth(instance.synth);
  }
  if (instance.settings) {
    delete_fluid_settings(instance.settings);
  }
  instance = Instance{};
}

/** One synth pool: the shared settings and the instances built from them. */
class Synth {
 public:
  std::mutex mutex;

  void disposeAll() {
    std::lock_guard<std::mutex> lock(mutex);
    for (auto &instance : instances_) {
      destroyInstance(instance);
    }
    instances_.clear();
  }

  // `initialize`: rebuild the pool for a soundfont, or just grow it when the
  // font is unchanged — the same branch the Apple module takes.
  bool initialize(const std::string &path, int instanceCount, int midiChannels,
                  int polyphony, bool chorus, bool reverb, double initialGain,
                  std::string *error) {
    std::lock_guard<std::mutex> lock(mutex);
    if (!instances_.empty() && path == soundfontPath_) {
      // Already up; just grow the pool below.
    } else {
      for (auto &instance : instances_) {
        destroyInstance(instance);
      }
      instances_.clear();
      soundfontPath_ = path;
      midiChannels_ = midiChannels > 0 ? midiChannels : 256;
      polyphony_ = polyphony > 0 ? polyphony : 2048;
      chorus_ = chorus;
      reverb_ = reverb;
      if (initialGain > 0) {
        initialGain_ = initialGain;
      }
    }
    while (static_cast<int>(instances_.size()) < instanceCount) {
      if (!addInstance(error)) {
        return false;
      }
    }
    return true;
  }

  bool ensureInstances(int count, std::string *error) {
    std::lock_guard<std::mutex> lock(mutex);
    while (static_cast<int>(instances_.size()) < count) {
      if (!addInstance(error)) {
        return false;
      }
    }
    return true;
  }

  double currentTime() {
    std::lock_guard<std::mutex> lock(mutex);
    Instance *first = instanceAt(0);
    return first ? fluid_sequencer_get_tick(first->sequencer) / 1000.0 : 0.0;
  }

  double outputLatency() {
    std::lock_guard<std::mutex> lock(mutex);
    Instance *first = instanceAt(0);
    if (!first) {
      return 0;
    }
    int periodSize = 0, periods = 0;
    double sampleRate = 44100;
    fluid_settings_getint(first->settings, "audio.period-size", &periodSize);
    fluid_settings_getint(first->settings, "audio.periods", &periods);
    fluid_settings_getnum(first->settings, "synth.sample-rate", &sampleRate);
    int usablePeriods = periods > 1 ? periods : 1;
    return sampleRate > 0
               ? static_cast<double>(periodSize) * usablePeriods / sampleRate
               : 0;
  }

  void noteAt(int index, int channel, int midi, int velocity,
              double delaySeconds, double durationSeconds) {
    std::lock_guard<std::mutex> lock(mutex);
    Instance *instance = instanceAt(index);
    if (!instance) {
      return;
    }
    fluid_event_t *event = new_fluid_event();
    fluid_event_set_source(event, -1);
    fluid_event_set_dest(event, instance->destination);
    // Never zero: a note of no length may not sound (see the web host).
    long durationMs = llround(durationSeconds * 1000);
    unsigned int duration =
        static_cast<unsigned int>(durationMs > 1 ? durationMs : 1);
    fluid_event_note(event, channel, static_cast<short>(midi),
                     static_cast<short>(velocity), duration);
    long delay = llround(delaySeconds * 1000);
    unsigned int at = fluid_sequencer_get_tick(instance->sequencer) +
                      static_cast<unsigned int>(delay > 0 ? delay : 0);
    fluid_sequencer_send_at(instance->sequencer, event, at, 1);
    delete_fluid_event(event);
  }

  void noteOn(int index, int channel, int midi, int velocity) {
    std::lock_guard<std::mutex> lock(mutex);
    if (Instance *instance = instanceAt(index)) {
      fluid_synth_noteon(instance->synth, channel, midi, velocity);
    }
  }

  void noteOff(int index, int channel, int midi) {
    std::lock_guard<std::mutex> lock(mutex);
    if (Instance *instance = instanceAt(index)) {
      fluid_synth_noteoff(instance->synth, channel, midi);
    }
  }

  /** A melodic program — never on the drum channel, where it silences the kit. */
  void programSelect(int index, int channel, int program) {
    std::lock_guard<std::mutex> lock(mutex);
    Instance *instance = instanceAt(index);
    if (!instance || channel == kPercussionChannel) {
      return;
    }
    fluid_synth_set_channel_type(instance->synth, channel, CHANNEL_TYPE_MELODIC);
    fluid_synth_program_select(instance->synth, channel, instance->sfontId, 0,
                               program);
  }

  /** Unselect old score presets so dynamic sample loading can release their PCM. */
  void setPrograms() {
    std::lock_guard<std::mutex> lock(mutex);
    for (auto &instance : instances_) {
      if (!instance.synth) continue;
      int channelCount = 256;
      fluid_settings_getint(instance.settings, "synth.midi-channels",
                            &channelCount);
      for (int channel = 0; channel < channelCount; ++channel) {
        fluid_synth_all_sounds_off(instance.synth, channel);
        fluid_synth_unset_program(instance.synth, channel);
      }
    }
  }

  /** Drums: the standard kit first, so a kit the font lacks falls back to drums. */
  void setChannelPercussion(int index, int channel, int kit) {
    std::lock_guard<std::mutex> lock(mutex);
    Instance *instance = instanceAt(index);
    if (!instance) {
      return;
    }
    fluid_synth_set_channel_type(instance->synth, channel, CHANNEL_TYPE_DRUM);
    fluid_synth_program_select(instance->synth, channel, instance->sfontId,
                               kDrumBank, kStandardKit);
    if (kit >= 0 && kit != kStandardKit) {
      fluid_synth_program_select(instance->synth, channel, instance->sfontId,
                                 kDrumBank, kit);
    }
  }

  void controlChange(int index, int channel, int control, int value) {
    std::lock_guard<std::mutex> lock(mutex);
    if (Instance *instance = instanceAt(index)) {
      fluid_synth_cc(instance->synth, channel, control, value);
    }
  }

  void cancelScheduledOn(int index) {
    std::lock_guard<std::mutex> lock(mutex);
    if (Instance *instance = instanceAt(index)) {
      fluid_sequencer_remove_events(instance->sequencer, -1, -1, -1);
    }
  }

  void allSoundOff() {
    std::lock_guard<std::mutex> lock(mutex);
    for (auto &instance : instances_) {
      fluid_sequencer_remove_events(instance.sequencer, -1, -1, -1);
      fluid_synth_all_sounds_off(instance.synth, -1);
    }
  }

  void setInterpolation(int order) {
    std::lock_guard<std::mutex> lock(mutex);
    interpolation_ = order;
    for (auto &instance : instances_) {
      fluid_synth_set_interp_method(instance.synth, -1, interpolation_);
    }
  }

  void setMasterVolume(double volume) {
    std::lock_guard<std::mutex> lock(mutex);
    masterVolume_ = volume;
    for (auto &instance : instances_) {
      fluid_synth_set_gain(instance.synth,
                           static_cast<float>(initialGain_ * masterVolume_));
    }
  }

 private:
  std::vector<Instance> instances_;
  std::string soundfontPath_;
  int midiChannels_ = 256;
  int polyphony_ = 2048;
  bool chorus_ = false;
  bool reverb_ = false;
  double initialGain_ = 0.35;
  double masterVolume_ = 1;
  int interpolation_ = -1;

  Instance *instanceAt(int index) {
    return index >= 0 && index < static_cast<int>(instances_.size())
               ? &instances_[index]
               : nullptr;
  }

  /** One synth with its own audio output and a sequencer timed by that output. */
  bool addInstance(std::string *error) {
    Instance instance;
    instance.settings = new_fluid_settings();
    fluid_settings_setint(instance.settings, "synth.midi-channels",
                          midiChannels_);
    fluid_settings_setint(instance.settings, "synth.polyphony", polyphony_);
    // FluidR3 is a compressed 23 MB file but expands to hundreds of MB of PCM.
    // FluidSynth can load/unload a preset's samples as channels select it, so a
    // score with a few instruments does not decode every GM instrument up front.
    fluid_settings_setint(instance.settings, "synth.dynamic-sample-loading", 1);
    fluid_settings_setnum(instance.settings, "synth.gain",
                          initialGain_ * masterVolume_);
    fluid_settings_setint(instance.settings, "synth.chorus.active",
                          chorus_ ? 1 : 0);
    fluid_settings_setint(instance.settings, "synth.reverb.active",
                          reverb_ ? 1 : 0);
    // The web host's, stated rather than inherited: see `synth-host.ts`.
    fluid_settings_setstr(instance.settings, "synth.midi-bank-select", "gs");
    fluid_settings_setint(instance.settings, "synth.min-note-length", 10);
    // Oboe picks AAudio on API 26+, OpenSL ES below — the lowest-latency path
    // the device offers, chosen at run time.
    fluid_settings_setstr(instance.settings, "audio.driver", "oboe");

    instance.synth = new_fluid_synth(instance.settings);
    if (!instance.synth) {
      *error = "Could not create a fluidsynth synth.";
      destroyInstance(instance);
      return false;
    }
    instance.sfontId =
        fluid_synth_sfload(instance.synth, soundfontPath_.c_str(), 1);
    if (instance.sfontId == FLUID_FAILED) {
      *error = "Could not load the soundfont at " + soundfontPath_ + ".";
      destroyInstance(instance);
      return false;
    }
    if (interpolation_ >= 0) {
      fluid_synth_set_interp_method(instance.synth, -1, interpolation_);
    }
    // Sample-timed: the clock advances as audio is rendered, which is what a
    // playhead has to agree with.
    instance.sequencer = new_fluid_sequencer2(0);
    fluid_sequencer_set_time_scale(instance.sequencer, 1000);
    instance.destination =
        fluid_sequencer_register_fluidsynth(instance.sequencer, instance.synth);
    instance.driver = new_fluid_audio_driver(instance.settings, instance.synth);
    if (!instance.driver) {
      *error = "Could not open the audio output.";
      destroyInstance(instance);
      return false;
    }
    instances_.push_back(instance);
    return true;
  }
};

Synth *asSynth(jlong handle) { return reinterpret_cast<Synth *>(handle); }

std::string toString(JNIEnv *env, jstring value) {
  if (!value) return {};
  const char *chars = env->GetStringUTFChars(value, nullptr);
  std::string result(chars ? chars : "");
  if (chars) env->ReleaseStringUTFChars(value, chars);
  return result;
}

}  // namespace

extern "C" {

JNIEXPORT jlong JNICALL
Java_com_moosiac_synth_MoosiacSynthModule_nativeCreate(JNIEnv *, jobject) {
  return reinterpret_cast<jlong>(new Synth());
}

JNIEXPORT void JNICALL
Java_com_moosiac_synth_MoosiacSynthModule_nativeDispose(JNIEnv *, jobject,
                                                        jlong handle) {
  if (Synth *synth = asSynth(handle)) {
    synth->disposeAll();
  }
}

JNIEXPORT void JNICALL
Java_com_moosiac_synth_MoosiacSynthModule_nativeDestroy(JNIEnv *, jobject,
                                                        jlong handle) {
  delete asSynth(handle);
}

/** Returns null on success, or the error message to reject the JS promise with. */
JNIEXPORT jstring JNICALL
Java_com_moosiac_synth_MoosiacSynthModule_nativeInitialize(
    JNIEnv *env, jobject, jlong handle, jstring path, jint instanceCount,
    jint midiChannels, jint polyphony, jboolean chorus, jboolean reverb,
    jdouble initialGain) {
  Synth *synth = asSynth(handle);
  if (!synth) return env->NewStringUTF("Synth was not created.");
  std::string error;
  if (!synth->initialize(toString(env, path), instanceCount, midiChannels,
                         polyphony, chorus == JNI_TRUE, reverb == JNI_TRUE,
                         initialGain, &error)) {
    return env->NewStringUTF(error.c_str());
  }
  return nullptr;
}

JNIEXPORT jstring JNICALL
Java_com_moosiac_synth_MoosiacSynthModule_nativeEnsureInstances(JNIEnv *env,
                                                                jobject,
                                                                jlong handle,
                                                                jint count) {
  Synth *synth = asSynth(handle);
  if (!synth) return env->NewStringUTF("Synth was not created.");
  std::string error;
  if (!synth->ensureInstances(count, &error)) {
    return env->NewStringUTF(error.c_str());
  }
  return nullptr;
}

JNIEXPORT jdouble JNICALL
Java_com_moosiac_synth_MoosiacSynthModule_nativeCurrentTime(JNIEnv *, jobject,
                                                            jlong handle) {
  Synth *synth = asSynth(handle);
  return synth ? synth->currentTime() : 0.0;
}

JNIEXPORT jdouble JNICALL
Java_com_moosiac_synth_MoosiacSynthModule_nativeOutputLatency(JNIEnv *, jobject,
                                                              jlong handle) {
  Synth *synth = asSynth(handle);
  return synth ? synth->outputLatency() : 0.0;
}

JNIEXPORT void JNICALL Java_com_moosiac_synth_MoosiacSynthModule_nativeNoteAt(
    JNIEnv *, jobject, jlong handle, jint index, jint channel, jint midi,
    jint velocity, jdouble delaySeconds, jdouble durationSeconds) {
  if (Synth *synth = asSynth(handle)) {
    synth->noteAt(index, channel, midi, velocity, delaySeconds,
                  durationSeconds);
  }
}

JNIEXPORT void JNICALL Java_com_moosiac_synth_MoosiacSynthModule_nativeNoteOn(
    JNIEnv *, jobject, jlong handle, jint index, jint channel, jint midi,
    jint velocity) {
  if (Synth *synth = asSynth(handle)) {
    synth->noteOn(index, channel, midi, velocity);
  }
}

JNIEXPORT void JNICALL Java_com_moosiac_synth_MoosiacSynthModule_nativeNoteOff(
    JNIEnv *, jobject, jlong handle, jint index, jint channel, jint midi) {
  if (Synth *synth = asSynth(handle)) {
    synth->noteOff(index, channel, midi);
  }
}

JNIEXPORT void JNICALL
Java_com_moosiac_synth_MoosiacSynthModule_nativeProgramSelect(
    JNIEnv *, jobject, jlong handle, jint index, jint channel, jint program) {
  if (Synth *synth = asSynth(handle)) {
    synth->programSelect(index, channel, program);
  }
}

JNIEXPORT void JNICALL
Java_com_moosiac_synth_MoosiacSynthModule_nativeSetPrograms(JNIEnv *, jobject,
                                                            jlong handle) {
  if (Synth *synth = asSynth(handle)) {
    synth->setPrograms();
  }
}

JNIEXPORT void JNICALL
Java_com_moosiac_synth_MoosiacSynthModule_nativeSetChannelPercussion(
    JNIEnv *, jobject, jlong handle, jint index, jint channel, jint kit) {
  if (Synth *synth = asSynth(handle)) {
    synth->setChannelPercussion(index, channel, kit);
  }
}

JNIEXPORT void JNICALL
Java_com_moosiac_synth_MoosiacSynthModule_nativeControlChange(
    JNIEnv *, jobject, jlong handle, jint index, jint channel, jint control,
    jint value) {
  if (Synth *synth = asSynth(handle)) {
    synth->controlChange(index, channel, control, value);
  }
}

JNIEXPORT void JNICALL
Java_com_moosiac_synth_MoosiacSynthModule_nativeCancelScheduledOn(
    JNIEnv *, jobject, jlong handle, jint index) {
  if (Synth *synth = asSynth(handle)) {
    synth->cancelScheduledOn(index);
  }
}

JNIEXPORT void JNICALL
Java_com_moosiac_synth_MoosiacSynthModule_nativeAllSoundOff(JNIEnv *, jobject,
                                                            jlong handle) {
  if (Synth *synth = asSynth(handle)) {
    synth->allSoundOff();
  }
}

JNIEXPORT void JNICALL
Java_com_moosiac_synth_MoosiacSynthModule_nativeSetInterpolation(JNIEnv *,
                                                                 jobject,
                                                                 jlong handle,
                                                                 jint order) {
  if (Synth *synth = asSynth(handle)) {
    synth->setInterpolation(order);
  }
}

JNIEXPORT void JNICALL
Java_com_moosiac_synth_MoosiacSynthModule_nativeSetMasterVolume(JNIEnv *,
                                                                jobject,
                                                                jlong handle,
                                                                jdouble volume) {
  if (Synth *synth = asSynth(handle)) {
    synth->setMasterVolume(volume);
  }
}

}  // extern "C"
