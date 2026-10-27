/**
 * Mobile is landscape-only, on every device.
 *
 * A system of music is wide: a portrait phone shows about two bars of it, and a
 * portrait tablet is no better once the inspector column and the track gutter
 * are both accounted for. So iOS, iPadOS and Android are all landscape, and the
 * layout code is allowed to assume it.
 *
 * This is declarative on both platforms and therefore invisible to every other
 * test in the suite — nothing renders a manifest. It is also exactly the kind of
 * thing that regresses silently: the app simply rotates one day and the score
 * gets narrow. Android had that bug. `AndroidManifest.xml` declared
 * `sensorLandscape` and `MainActivity.onCreate` then called
 * `setRequestedOrientation` with `SCREEN_ORIENTATION_UNSPECIFIED` on any device
 * over `sw600dp`, which is a runtime override of the manifest and wins — so the
 * tablet emulator launched in portrait while the manifest said it could not.
 *
 * `sensorLandscape` rather than `landscape`: both landscape directions are
 * upright for this app, so a device turned 180° should follow rather than show
 * the music upside down. And rather than `userLandscape`, which obeys the
 * system rotation lock — a reader with rotation locked would be pinned to one
 * of the two, which is a setting about portrait/landscape being answered for an
 * app that has no portrait.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const ANDROID_ORIENTATION = 'sensorLandscape';

/**
 * The app now supports all orientations. The iPad key is separate, and iPadOS
 * reads it in preference to the base one; iPhones omit upside-down by platform
 * convention, so the two keys differ.
 */
const IOS_ORIENTATIONS: Record<string, string[]> = {
  UISupportedInterfaceOrientations: [
    'UIInterfaceOrientationPortrait',
    'UIInterfaceOrientationLandscapeLeft',
    'UIInterfaceOrientationLandscapeRight',
  ],
  'UISupportedInterfaceOrientations~ipad': [
    'UIInterfaceOrientationPortrait',
    'UIInterfaceOrientationPortraitUpsideDown',
    'UIInterfaceOrientationLandscapeLeft',
    'UIInterfaceOrientationLandscapeRight',
  ],
};

/** Comments name the thing they forbid; only the code is being checked. */
function withoutComments(kotlin: string): string {
  return kotlin.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
}

function plistArray(plist: string, key: string): string[] {
  const match = plist.match(
    new RegExp(`<key>${key}</key>\\s*<array>([\\s\\S]*?)</array>`),
  );
  if (!match) return [];
  return [...match[1]!.matchAll(/<string>([^<]+)<\/string>/g)].map(
    entry => entry[1]!,
  );
}

describe('android orientation', () => {
  const manifest = readFileSync(
    'android/app/src/main/AndroidManifest.xml',
    'utf8',
  );
  const activity = withoutComments(
    readFileSync(
      'android/app/src/main/java/com/moosiacrn/MainActivity.kt',
      'utf8',
    ),
  );

  it('is locked to landscape in the manifest', () => {
    expect(manifest).toContain(
      `android:screenOrientation="${ANDROID_ORIENTATION}"`,
    );
  });

  it('allows both landscape directions', () => {
    // `landscape` and `reverseLandscape` each pin one way round.
    expect(manifest).not.toContain('android:screenOrientation="landscape"');
    expect(manifest).not.toContain(
      'android:screenOrientation="reverseLandscape"',
    );
  });

  it('is not overridden at runtime', () => {
    // A `setRequestedOrientation` call in the activity beats the manifest, so
    // the manifest stops being the answer to "what can this app do".
    expect(activity).not.toMatch(
      /setRequestedOrientation|requestedOrientation/,
    );
  });

  it('has no screen-size orientation resource left behind', () => {
    // `R.bool.lock_landscape` existed only for the override above.
    expect(activity).not.toContain('lock_landscape');
    expect(manifest).not.toContain('lock_landscape');
  });
});

describe('ios orientation', () => {
  const plist = readFileSync('ios/music_app_rn/Info.plist', 'utf8');

  it.each(Object.keys(IOS_ORIENTATIONS))(
    '%s supports all orientations',
    key => {
      expect(plistArray(plist, key)).toEqual(IOS_ORIENTATIONS[key]);
    },
  );

  it('requires full screen, so iPadOS honours the restriction', () => {
    // Without this an iPad app is multitasking-capable, and a multitasking app
    // is required to support every orientation — the declaration above is then
    // one the system is entitled to ignore.
    expect(plist).toMatch(/<key>UIRequiresFullScreen<\/key>\s*<true\s*\/>/);
  });
});
