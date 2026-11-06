package com.moosiac.synth

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableArray
import java.io.File

/**
 * Native SoundFont synthesis on Android, as `@sudobility/music_player`'s
 * `NativeSynthApi` — the counterpart of `apple/MoosiacSynth.mm`.
 *
 * The thin Kotlin shell over a C++/JNI core (`moosiac_synth.cpp`) that holds
 * the FluidSynth handles and makes the `fluid_*` calls. The note methods are
 * `isBlockingSynchronousMethod` to match the Apple contract: the shared
 * scheduler reads `currentTime()` and schedules `noteAt()` inline and must not
 * pick up a bridge hop between them.
 *
 * It is a classic bridge module registered through a `ReactPackage`, as the
 * sibling `@moosiac/print` module is; React Native's TurboModule interop runs
 * it, synchronous methods included, under this app's new architecture.
 *
 * Every blocking-synchronous method returns a value, never `Unit`. Apple's
 * bridge allows a synchronous method to return void; Android's new-architecture
 * TurboModule interop does not — it asserts `returnType == void iff the method
 * is synchronous` and, failing it on one method, refuses to parse the whole
 * module (so `NativeModules.MoosiacSynth` comes back `undefined`). The fire-
 * and-forget setters therefore return `true`, which the JS wrapper ignores.
 */
class MoosiacSynthModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    /** The opaque `Synth*` the JNI core allocates; freed in [invalidate]. */
    private val handle: Long = nativeCreate()

    override fun getName() = NAME

    override fun invalidate() {
        super.invalidate()
        nativeDispose(handle)
        nativeDestroy(handle)
    }

    @ReactMethod(isBlockingSynchronousMethod = true)
    fun isSupported(): Boolean = true

    /**
     * The bundled font as a readable file path.
     *
     * The `.sf3` ships as an APK asset — compressed, with no filesystem path —
     * and FluidSynth's `sfload` needs a real file, so it is copied into the
     * app's files directory once and that path returned. Copied only when the
     * sizes differ, so a relaunch does not rewrite 23 MB.
     */
    @ReactMethod(isBlockingSynchronousMethod = true)
    fun bundledSoundfontPath(): String? {
        val target = File(reactContext.filesDir, SOUNDFONT_NAME)
        return runCatching {
            reactContext.assets.open(SOUNDFONT_NAME).use { input ->
                val expected = input.available().toLong()
                if (!target.exists() || target.length() != expected) {
                    target.outputStream().use { output -> input.copyTo(output) }
                }
            }
            target.absolutePath
        }.getOrNull()
    }

    /**
     * Android has no per-device output picker like CoreAudio; the system routes
     * audio itself. One entry so the JS `AudioOutputSelect` has something
     * consistent to show.
     */
    @ReactMethod
    fun outputDevices(promise: Promise) {
        val devices: WritableArray = Arguments.createArray()
        devices.pushMap(Arguments.createMap().apply {
            putString("id", "default")
            putString("name", "System output")
        })
        promise.resolve(devices)
    }

    @ReactMethod(isBlockingSynchronousMethod = true)
    fun selectedOutputDevice(): String = "default"

    /** A no-op: the system owns routing. Resolves rather than throwing. */
    @ReactMethod
    fun setOutputDevice(device: String?, promise: Promise) {
        promise.resolve(null)
    }

    @ReactMethod
    fun initialize(
        soundfontUri: String?,
        instanceCount: Double,
        settings: ReadableMap?,
        promise: Promise,
    ) {
        val path = soundfontUri?.removePrefix("file://").orEmpty()
        val error = nativeInitialize(
            handle,
            path,
            instanceCount.toInt(),
            settings.intOr("midiChannelCount", 0),
            settings.intOr("polyphony", 0),
            settings.boolOr("chorusActive", false),
            settings.boolOr("reverbActive", false),
            settings.doubleOr("initialGain", 0.0),
        )
        if (error != null) promise.reject("synth_init", error) else promise.resolve(null)
    }

    @ReactMethod
    fun ensureInstances(count: Double, promise: Promise) {
        val error = nativeEnsureInstances(handle, count.toInt())
        if (error != null) promise.reject("synth_instances", error) else promise.resolve(null)
    }

    @ReactMethod(isBlockingSynchronousMethod = true)
    fun currentTime(): Double = nativeCurrentTime(handle)

    @ReactMethod(isBlockingSynchronousMethod = true)
    fun outputLatency(): Double = nativeOutputLatency(handle)

    @ReactMethod(isBlockingSynchronousMethod = true)
    fun noteAt(
        index: Double,
        channel: Double,
        midi: Double,
        velocity: Double,
        delaySeconds: Double,
        durationSeconds: Double,
    ): Boolean {
        nativeNoteAt(
            handle, index.toInt(), channel.toInt(), midi.toInt(),
            velocity.toInt(), delaySeconds, durationSeconds,
        )
        return true
    }

    @ReactMethod(isBlockingSynchronousMethod = true)
    fun noteOn(index: Double, channel: Double, midi: Double, velocity: Double): Boolean {
        nativeNoteOn(handle, index.toInt(), channel.toInt(), midi.toInt(), velocity.toInt())
        return true
    }

    @ReactMethod(isBlockingSynchronousMethod = true)
    fun noteOff(index: Double, channel: Double, midi: Double): Boolean {
        nativeNoteOff(handle, index.toInt(), channel.toInt(), midi.toInt())
        return true
    }

    @ReactMethod(isBlockingSynchronousMethod = true)
    fun programSelect(index: Double, channel: Double, program: Double): Boolean {
        nativeProgramSelect(handle, index.toInt(), channel.toInt(), program.toInt())
        return true
    }

    @ReactMethod(isBlockingSynchronousMethod = true)
    fun setPrograms(melodicPrograms: ReadableArray?, percussionPrograms: ReadableArray?): Boolean {
        // The programs are advisory — the synth unselects every channel so
        // dynamic sample loading can release the old score's PCM, exactly as
        // the Apple module does.
        nativeSetPrograms(handle)
        return true
    }

    @ReactMethod(isBlockingSynchronousMethod = true)
    fun setChannelPercussion(index: Double, channel: Double, kit: Double): Boolean {
        nativeSetChannelPercussion(handle, index.toInt(), channel.toInt(), kit.toInt())
        return true
    }

    @ReactMethod(isBlockingSynchronousMethod = true)
    fun controlChange(index: Double, channel: Double, control: Double, value: Double): Boolean {
        nativeControlChange(handle, index.toInt(), channel.toInt(), control.toInt(), value.toInt())
        return true
    }

    @ReactMethod(isBlockingSynchronousMethod = true)
    fun cancelScheduledOn(index: Double): Boolean {
        nativeCancelScheduledOn(handle, index.toInt())
        return true
    }

    @ReactMethod(isBlockingSynchronousMethod = true)
    fun allSoundOff(): Boolean {
        nativeAllSoundOff(handle)
        return true
    }

    @ReactMethod(isBlockingSynchronousMethod = true)
    fun setInterpolation(order: Double): Boolean {
        nativeSetInterpolation(handle, order.toInt())
        return true
    }

    @ReactMethod(isBlockingSynchronousMethod = true)
    fun setMasterVolume(volume: Double): Boolean {
        nativeSetMasterVolume(handle, volume)
        return true
    }

    @ReactMethod(isBlockingSynchronousMethod = true)
    fun dispose(): Boolean {
        nativeDispose(handle)
        return true
    }

    private fun ReadableMap?.intOr(key: String, fallback: Int): Int =
        if (this?.hasKey(key) == true && !isNull(key)) getInt(key) else fallback

    private fun ReadableMap?.doubleOr(key: String, fallback: Double): Double =
        if (this?.hasKey(key) == true && !isNull(key)) getDouble(key) else fallback

    private fun ReadableMap?.boolOr(key: String, fallback: Boolean): Boolean =
        if (this?.hasKey(key) == true && !isNull(key)) getBoolean(key) else fallback

    private external fun nativeCreate(): Long
    private external fun nativeDispose(handle: Long)
    private external fun nativeDestroy(handle: Long)
    private external fun nativeInitialize(
        handle: Long, path: String, instanceCount: Int, midiChannels: Int,
        polyphony: Int, chorus: Boolean, reverb: Boolean, initialGain: Double,
    ): String?

    private external fun nativeEnsureInstances(handle: Long, count: Int): String?
    private external fun nativeCurrentTime(handle: Long): Double
    private external fun nativeOutputLatency(handle: Long): Double
    private external fun nativeNoteAt(
        handle: Long, index: Int, channel: Int, midi: Int, velocity: Int,
        delaySeconds: Double, durationSeconds: Double,
    )

    private external fun nativeNoteOn(handle: Long, index: Int, channel: Int, midi: Int, velocity: Int)
    private external fun nativeNoteOff(handle: Long, index: Int, channel: Int, midi: Int)
    private external fun nativeProgramSelect(handle: Long, index: Int, channel: Int, program: Int)
    private external fun nativeSetPrograms(handle: Long)
    private external fun nativeSetChannelPercussion(handle: Long, index: Int, channel: Int, kit: Int)
    private external fun nativeControlChange(handle: Long, index: Int, channel: Int, control: Int, value: Int)
    private external fun nativeCancelScheduledOn(handle: Long, index: Int)
    private external fun nativeAllSoundOff(handle: Long)
    private external fun nativeSetInterpolation(handle: Long, order: Int)
    private external fun nativeSetMasterVolume(handle: Long, volume: Double)

    companion object {
        const val NAME = "MoosiacSynth"
        private const val SOUNDFONT_NAME = "FluidR3Mono_GM.sf3"

        init {
            System.loadLibrary("moosiacsynth")
        }
    }
}
