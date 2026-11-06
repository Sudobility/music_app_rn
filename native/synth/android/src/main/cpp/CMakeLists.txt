# Builds libmoosiacsynth.so — the JNI core of @moosiac/synth — and links it
# against the prebuilt libfluidsynth.so for the ABI being built.
#
# libfluidsynth.so is produced by native/synth/scripts/build-fluidsynth-android.sh
# and committed under ../jniLibs/<abi>/. Gradle packages everything in jniLibs
# into the APK on its own; this file only needs it to link against, so it is
# declared as an IMPORTED library pointing at that same committed binary.
cmake_minimum_required(VERSION 3.22.1)
project(moosiacsynth)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

set(JNILIBS_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../jniLibs/${ANDROID_ABI}")
set(FLUIDSYNTH_SO "${JNILIBS_DIR}/libfluidsynth.so")

if(NOT EXISTS "${FLUIDSYNTH_SO}")
  message(FATAL_ERROR
    "Missing ${FLUIDSYNTH_SO}. Run native/synth/scripts/build-fluidsynth-android.sh "
    "to produce the FluidSynth libraries before building the Android app.")
endif()

add_library(fluidsynth SHARED IMPORTED)
set_target_properties(fluidsynth PROPERTIES IMPORTED_LOCATION "${FLUIDSYNTH_SO}")

add_library(moosiacsynth SHARED moosiac_synth.cpp)

target_include_directories(moosiacsynth PRIVATE
  "${CMAKE_CURRENT_SOURCE_DIR}/include")

find_library(log-lib log)

target_link_libraries(moosiacsynth fluidsynth ${log-lib})
