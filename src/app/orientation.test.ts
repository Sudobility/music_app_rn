/**
 * Mobile supports every orientation, on every device.
 *
 * A system of music is wide, so this app was once landscape-only — but a
 * foldable like the iPhone Duo has a narrow portrait cover screen the app has
 * to work on, so every orientation is allowed now and the layout copes by
 * wrapping its bars rather than assuming width. This is declarative on both
 * platforms and so invisible to every other test (nothing renders a manifest),
 * and exactly the kind of thing that regresses silently, so it is pinned here.
 *
 * Android: `fullUser`, and `MainActivity` must not override it at runtime — a
 * `setRequestedOrientation` call beats the manifest, which is the bug that once
 * launched a tablet locked the wrong way. iOS: all four orientations under both
 * the base key and the iPad key, with `UIRequiresFullScreen` false so an iPad,
 * which is multitasking-capable, honours them.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const ANDROID_ORIENTATION = 'fullUser';

/**
 * All four orientations, under both keys. iPadOS reads the `~ipad` key in
 * preference to the base one, so both are stated; here they agree.
 */
const IOS_ORIENTATIONS: Record<string, string[]> = {
  UISupportedInterfaceOrientations: [
    'UIInterfaceOrientationPortrait',
    'UIInterfaceOrientationPortraitUpsideDown',
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

  it('supports every orientation in the manifest', () => {
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

  it('does not require full screen, so an iPad honours every orientation', () => {
    // The app supports every orientation, so it has no reason to opt out of
    // iPad multitasking: `UIRequiresFullScreen` is false, and a multitasking
    // app is held to the orientation arrays above, which already list them all.
    expect(plist).toMatch(/<key>UIRequiresFullScreen<\/key>\s*<false\s*\/>/);
  });
});
