/**
 * A row of controls has one height, and it is the touch target's.
 *
 * `SLOT_SELECT_CLASS` has to be written as literals, so nothing but this
 * relates it to `MIN_TOUCH_TARGET`: change the constant and the picker in a
 * row is the one control that did not follow.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (path: string) => readFileSync(join(__dirname, path), 'utf8');

describe('controls in a row share the touch target height', () => {
  it('gives a Select the height the library gives a touch target', () => {
    const library = read(
      '../../../node_modules/@sudobility/components-rn/src/lib/touch-target.ts',
    );
    const stated =
      /MIN_TOUCH_TARGET = Platform\.OS === 'android' \? (\d+) : (\d+)/.exec(
        library,
      );
    expect(
      stated,
      'MIN_TOUCH_TARGET is no longer stated this way',
    ).not.toBeNull();
    const [, android, other] = stated!;
    expect(
      read(
        '../../../node_modules/@sudobility/music_ui_rn/src/components/controls/FieldRow.tsx',
      ),
    ).toContain(
      `Platform.OS === 'android' ? 'min-h-[${android}px]' : 'min-h-[${other}px]'`,
    );
  });

  it.each([
    [
      'the time signature',
      '../../../node_modules/@sudobility/music_ui_rn/src/features/inspector/MeasureTab.tsx',
    ],
    [
      'an instrument and its remove button',
      '../../../node_modules/@sudobility/music_ui_rn/src/features/generation/ScoreSetupFields.tsx',
    ],
  ])('draws %s at one height', (_name, path) => {
    const source = read(path);
    expect(source).toContain('SLOT_SELECT_CLASS');
    expect(source).toContain('<FieldSlot');
  });
});
