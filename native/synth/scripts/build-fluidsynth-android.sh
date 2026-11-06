#!/bin/bash
#
# Builds android/src/main/jniLibs/<abi>/libfluidsynth.so for Android, with SF3
# support: an arm64-v8a slice for devices and an x86_64 slice for the emulator.
#
# This is the Android mirror of scripts/build-fluidsynth-apple.sh. The gap is
# the same one iOS had: the XCFramework/libraries FluidSynth publishes are built
# with `-Denable-libsndfile=OFF`, so `fluid_synth_sfload` cannot read the
# Ogg-Vorbis-compressed FluidR3Mono_GM.sf3 this app bundles, and Android fell
# back to decoding MP3 sample packs in JavaScript when Play was pressed.
#
# This cross-compiles the same dependency chain the Apple script does, with the
# Android NDK, and links the static Xiph/libsndfile libraries INTO one dynamic
# libfluidsynth.so per ABI:
#
#   libogg -> libvorbis, FLAC, Opus -> libsndfile -> FluidSynth
#                                   Oboe ----------/
#
# Only Vorbis is wanted — it is what SF3 is compressed with — but libsndfile
# offers its Ogg codecs as one switch: without FLAC and Opus present too it
# turns all of them off, Vorbis included, so they are built to be allowed it.
#
# Audio driver: Oboe (AAudio on API 26+, OpenSL ES below that — lowest latency,
# chosen by Oboe itself at run time). The CoreAudio/OpenSL drivers are off.
# Oboe is built static here and folded into libfluidsynth.so the same way the
# Xiph libraries are, so what ships is one `.so` per ABI with no extra runtime
# dependency beyond the system audio libraries.
#
# FluidSynth and libsndfile are LGPL-2.1; a dynamic library the app links
# against is how an app may use them. The Xiph libraries are BSD; Oboe is
# Apache-2.0.
#
# Usage:   native/synth/scripts/build-fluidsynth-android.sh
# Needs:   the Android NDK, cmake, git, curl
# Env:     ANDROID_NDK / ANDROID_NDK_HOME / ANDROID_SDK_ROOT (one of them, or
#                        the NDK is found under the default SDK location)
#          WORK          where to download and build (default: a fresh temp dir)
#          ANDROID_API   minSdkVersion to target (default 24, android/build.gradle's)
#          ABIS          space-separated ABIs (default "arm64-v8a x86_64")
#
set -euo pipefail

OGG_VERSION=1.3.5
VORBIS_VERSION=1.3.7
FLAC_VERSION=1.4.3
OPUS_VERSION=1.5.2
SNDFILE_VERSION=1.2.2
FLUIDSYNTH_VERSION=2.6.0
# Oboe is cloned at a tag rather than downloaded as an archive, to match how
# FluidSynth itself is fetched (its C++11 layer needs submodules).
OBOE_VERSION=1.9.3

# Release archives are checked before they are built: what is linked into the
# app has to be what was asked for. These are the same sums the Apple script
# pins — the sources are identical; only the toolchain differs.
OGG_SHA256=0eb4b4b9420a0f51db142ba3f9c64b333f826532dc0f48c6410ae51f4799b664
VORBIS_SHA256=0e982409a9c3fc82ee06e08205b1355e5c6aa4c36bca58146ef399621b0ce5ab
FLAC_SHA256=6c58e69cd22348f441b861092b825e591d0b822e106de6eb0ee4d05d27205b70
OPUS_SHA256=65c1d2f78b9f2fb20082c38cbe47c951ad5839345876e46941612ee87f9a7ce1
SNDFILE_SHA256=3799ca9924d3125038880367bf1468e53a1b7e3686a934f098b7e1d286cdb80e

ANDROID_API="${ANDROID_API:-24}"
ABIS="${ABIS:-arm64-v8a x86_64}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT="${SCRIPT_DIR}/../android/src/main/jniLibs"
WORK="${WORK:-$(mktemp -d)}"
SRC="${WORK}/src"
JOBS="$(sysctl -n hw.ncpu 2>/dev/null || nproc)"

# Find the NDK. An explicit variable wins; otherwise look where the SDK puts it.
find_ndk() {
  if [ -n "${ANDROID_NDK:-}" ]; then echo "${ANDROID_NDK}"; return; fi
  if [ -n "${ANDROID_NDK_HOME:-}" ]; then echo "${ANDROID_NDK_HOME}"; return; fi
  local sdk="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-$HOME/Library/Android/sdk}}"
  if [ -d "${sdk}/ndk" ]; then
    # The highest installed version.
    ls -1 "${sdk}/ndk" | sort -V | tail -1 | sed "s#^#${sdk}/ndk/#"
    return
  fi
  echo ""
}

NDK="$(find_ndk)"
if [ -z "${NDK}" ] || [ ! -f "${NDK}/build/cmake/android.toolchain.cmake" ]; then
  echo "Android NDK not found. Set ANDROID_NDK to an NDK with build/cmake/android.toolchain.cmake." >&2
  exit 1
fi
TOOLCHAIN="${NDK}/build/cmake/android.toolchain.cmake"
# The one llvm-nm bundled with the NDK; used to prove Vorbis made it in.
NM="$(ls "${NDK}"/toolchains/llvm/prebuilt/*/bin/llvm-nm | head -1)"

mkdir -p "${SRC}"
echo "Building in ${WORK}"
echo "NDK: ${NDK}"
echo "ABIs: ${ABIS}  API: ${ANDROID_API}"

fetch() {
  local url="$1" sha="$2" file
  file="${SRC}/$(basename "${url}")"
  [ -f "${file}" ] || curl -fsSL -o "${file}" "${url}"
  echo "${sha}  ${file}" | shasum -a 256 -c - >/dev/null
  tar -xf "${file}" -C "${SRC}"
}

fetch "https://github.com/xiph/ogg/releases/download/v${OGG_VERSION}/libogg-${OGG_VERSION}.tar.gz" "${OGG_SHA256}"
fetch "https://github.com/xiph/vorbis/releases/download/v${VORBIS_VERSION}/libvorbis-${VORBIS_VERSION}.tar.gz" "${VORBIS_SHA256}"
fetch "https://github.com/xiph/flac/releases/download/${FLAC_VERSION}/flac-${FLAC_VERSION}.tar.xz" "${FLAC_SHA256}"
fetch "https://github.com/xiph/opus/releases/download/v${OPUS_VERSION}/opus-${OPUS_VERSION}.tar.gz" "${OPUS_SHA256}"
fetch "https://github.com/libsndfile/libsndfile/releases/download/${SNDFILE_VERSION}/libsndfile-${SNDFILE_VERSION}.tar.xz" "${SNDFILE_SHA256}"

# A clone rather than the release archive: FluidSynth's C++11 layer needs its
# `gcem` submodule, and an archive of a tag carries submodules as empty folders.
if [ ! -d "${SRC}/fluidsynth" ]; then
  git clone --quiet --depth 1 --branch "v${FLUIDSYNTH_VERSION}" \
    --recurse-submodules --shallow-submodules \
    https://github.com/FluidSynth/fluidsynth.git "${SRC}/fluidsynth"
fi

# Oboe, Google's low-latency audio library. FluidSynth's `enable-oboe` finds it
# through its installed CMake config, so it is built static into each prefix
# like the Xiph libraries.
if [ ! -d "${SRC}/oboe" ]; then
  git clone --quiet --depth 1 --branch "${OBOE_VERSION}" \
    https://github.com/google/oboe.git "${SRC}/oboe"
fi

# One slice: the dependency libraries into a prefix, then libfluidsynth.so
# against it.
#   $1 abi (arm64-v8a | x86_64)
build_slice() {
  local abi="$1"
  local build="${WORK}/${abi}" prefix="${WORK}/${abi}/prefix"
  mkdir -p "${prefix}"

  # pkg-config answers for the host Mac otherwise, and would offer Homebrew's
  # own macOS libsndfile to this Android build.
  export PKG_CONFIG_LIBDIR="${prefix}/lib/pkgconfig"
  unset PKG_CONFIG_PATH

  local platform=(
    -DCMAKE_TOOLCHAIN_FILE="${TOOLCHAIN}"
    -DANDROID_ABI="${abi}"
    -DANDROID_PLATFORM="android-${ANDROID_API}"
    # c++_shared is what React Native's own libraries use; one C++ runtime in
    # the APK, not a second static copy per module.
    -DANDROID_STL=c++_shared
    -DCMAKE_BUILD_TYPE=Release
    -DCMAKE_INSTALL_PREFIX="${prefix}"
    -DCMAKE_PREFIX_PATH="${prefix}"
    # Cross-compiling, CMake looks for packages only under the sysroot unless it
    # is told the prefix is part of the target's world too.
    -DCMAKE_FIND_ROOT_PATH="${prefix}"
    # Each library is found by the description it installed of itself, which
    # names what it was built with and what it links. FluidSynth's fallback
    # finder knows neither: it found libsndfile, reported "Support for SF3
    # files: no", and left FLAC and Opus off the link line.
    -DCMAKE_FIND_PACKAGE_PREFER_CONFIG=ON
    # The archives predate CMake 4, which refuses their minimum version.
    -DCMAKE_POLICY_VERSION_MINIMUM=3.5
    -G "Unix Makefiles"
  )
  local static=(
    -DBUILD_SHARED_LIBS=OFF
    -DCMAKE_POSITION_INDEPENDENT_CODE=ON
    -DBUILD_TESTING=OFF
  )

  echo "== ${abi}: libogg"
  cmake -S "${SRC}/libogg-${OGG_VERSION}" -B "${build}/ogg" \
    "${platform[@]}" "${static[@]}" -DINSTALL_DOCS=OFF >/dev/null
  cmake --build "${build}/ogg" --target install -j "${JOBS}" >/dev/null

  echo "== ${abi}: libvorbis"
  cmake -S "${SRC}/libvorbis-${VORBIS_VERSION}" -B "${build}/vorbis" \
    "${platform[@]}" "${static[@]}" >/dev/null
  cmake --build "${build}/vorbis" --target install -j "${JOBS}" >/dev/null

  echo "== ${abi}: FLAC"
  cmake -S "${SRC}/flac-${FLAC_VERSION}" -B "${build}/flac" \
    "${platform[@]}" "${static[@]}" \
    -DBUILD_PROGRAMS=OFF -DBUILD_EXAMPLES=OFF -DBUILD_DOCS=OFF \
    -DBUILD_CXXLIBS=OFF -DINSTALL_MANPAGES=OFF -DWITH_OGG=ON >/dev/null
  cmake --build "${build}/flac" --target install -j "${JOBS}" >/dev/null

  echo "== ${abi}: Opus"
  cmake -S "${SRC}/opus-${OPUS_VERSION}" -B "${build}/opus" \
    "${platform[@]}" "${static[@]}" \
    -DOPUS_BUILD_PROGRAMS=OFF -DOPUS_BUILD_TESTING=OFF >/dev/null
  cmake --build "${build}/opus" --target install -j "${JOBS}" >/dev/null

  # MP3 is its own switch, and off: no soundfont is compressed with it.
  echo "== ${abi}: libsndfile"
  cmake -S "${SRC}/libsndfile-${SNDFILE_VERSION}" -B "${build}/sndfile" \
    "${platform[@]}" "${static[@]}" \
    -DBUILD_PROGRAMS=OFF -DBUILD_EXAMPLES=OFF -DENABLE_CPACK=OFF \
    -DENABLE_PACKAGE_CONFIG=ON -DINSTALL_PKGCONFIG_MODULE=OFF \
    -DINSTALL_MANPAGES=OFF -DENABLE_MPEG=OFF \
    -DCMAKE_DISABLE_FIND_PACKAGE_mpg123=ON >/dev/null
  cmake --build "${build}/sndfile" --target install -j "${JOBS}" >/dev/null

  echo "== ${abi}: Oboe"
  cmake -S "${SRC}/oboe" -B "${build}/oboe" \
    "${platform[@]}" "${static[@]}" >/dev/null
  cmake --build "${build}/oboe" --target install -j "${JOBS}" >/dev/null
  # Oboe hardcodes its install into lib/<ABI>/ and ships no CMake/pkg-config
  # metadata, so FluidSynth's `find_library(NAMES oboe)` — which looks in
  # prefix/lib — does not see it. Put a copy where it looks.
  cp "${prefix}/lib/${abi}/liboboe.a" "${prefix}/lib/liboboe.a"

  # Oboe is a static .a with no exported link metadata, so the system
  # libraries it needs are added to the libfluidsynth.so link by hand
  # (CMAKE_SHARED_LINKER_FLAGS below). OpenSLES, android and log are all
  # present from API 9/24; aaudio is deliberately NOT linked — Oboe loads it
  # with dlopen at run time, so the .so still loads on API 24/25 devices that
  # have no libaaudio.so.
  echo "== ${abi}: FluidSynth"
  cmake -S "${SRC}/fluidsynth" -B "${build}/fluidsynth" \
    "${platform[@]}" \
    -Dosal=cpp11 \
    -Denable-libsndfile=ON \
    -Denable-oboe=ON \
    -Denable-opensles=OFF \
    -Denable-coreaudio=OFF \
    -Denable-threads=ON \
    -Denable-aufile=OFF -Denable-dbus=OFF -Denable-ladspa=OFF \
    -Denable-midishare=OFF -Denable-oss=OFF -Denable-pipewire=OFF \
    -Denable-portaudio=OFF -Denable-pulseaudio=OFF -Denable-readline=OFF \
    -Denable-sdl3=OFF -Denable-systemd=OFF -Denable-waveout=OFF \
    -Denable-dsound=OFF -Denable-wasapi=OFF -Denable-winmidi=OFF \
    -Denable-network=OFF -Denable-ipv6=OFF -Denable-openmp=OFF \
    -Denable-jack=OFF -Denable-alsa=OFF -Denable-framework=OFF \
    -DBUILD_SHARED_LIBS=ON \
    -DCMAKE_SHARED_LINKER_FLAGS="-lOpenSLES -landroid -llog" \
    >"${build}/fluidsynth-configure.log" 2>&1 || {
    tail -40 "${build}/fluidsynth-configure.log" >&2
    exit 1
  }
  grep -i -E "SF3|libsndfile:|[Oo]boe" "${build}/fluidsynth-configure.log" || true

  # Said by the configure step, and worth stopping for: a library built without
  # it looks identical until a soundfont fails to load on a device.
  grep -q -E "Support for SF3 files: +yes" "${build}/fluidsynth-configure.log" || {
    echo "FluidSynth was configured without SF3 support; see ${build}/fluidsynth-configure.log" >&2
    exit 1
  }

  cmake --build "${build}/fluidsynth" --target libfluidsynth -j "${JOBS}" \
    >"${build}/fluidsynth-build.log" 2>&1 || {
    tail -40 "${build}/fluidsynth-build.log" >&2
    exit 1
  }

  local so
  so="$(find "${build}/fluidsynth" -name 'libfluidsynth.so' | head -1)"
  [ -n "${so}" ] || { echo "No libfluidsynth.so produced for ${abi}" >&2; exit 1; }

  # The check the official libraries fail: Vorbis has to be in the binary, or
  # the SF3 soundfont will not load.
  local symbols
  symbols="$("${NM}" "${so}" 2>/dev/null | grep -c "vorbis_synthesis" || true)"
  [ "${symbols}" -gt 0 ] || {
    echo "No Vorbis decoder in ${so}" >&2
    exit 1
  }
  # And the Oboe driver: its registration symbol proves `enable-oboe` took,
  # without depending on the exact wording of FluidSynth's configure summary.
  local oboe
  oboe="$("${NM}" "${so}" 2>/dev/null | grep -c "fluid_oboe" || true)"
  [ "${oboe}" -gt 0 ] || {
    echo "No Oboe audio driver in ${so} — FluidSynth was built without it." >&2
    echo "See ${build}/fluidsynth-configure.log" >&2
    exit 1
  }

  mkdir -p "${OUTPUT}/${abi}"
  cp "${so}" "${OUTPUT}/${abi}/libfluidsynth.so"
  # c++_shared is a runtime dependency of the .so, but React Native already
  # ships libc++_shared.so in the APK, so a second copy here is not bundled —
  # it would only collide at packaging. The module is built with
  # ANDROID_STL=c++_shared against that one.
  echo "== ${abi}: wrote ${OUTPUT}/${abi}/libfluidsynth.so"
}

for abi in ${ABIS}; do
  build_slice "${abi}"
done

echo
echo "Built:"
find "${OUTPUT}" -name '*.so' | sort
cat <<'NOTE'

The app reads these from node_modules/@moosiac/synth, not from here, because
`@moosiac/synth` is a `file:` dependency CocoaPods/Gradle copy. To put the new
libraries in the app:

  rm -rf node_modules/@moosiac/synth && bun install
  (cd android && ./gradlew clean)

Then rebuild. Verify the library inside the built APK rather than trusting the
build: `unzip -l app.apk | grep libfluidsynth` and, for SF3 support,
`llvm-nm` on the extracted `.so` must show `vorbis_synthesis`.
NOTE
