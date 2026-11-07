/**
 * Text stays large enough to read, and touch targets large enough to hit.
 *
 * Both are the kind of rule that decays one commit at a time: somebody adds a
 * `text-xs` label or a `p-1` icon button, it looks fine on a 27-inch display,
 * and nobody notices until it ships to a phone. Neither types nor a render test
 * catches it, so the source is scanned instead.
 */
import { describe, expect, it } from 'vitest';
import { globSync, readFileSync } from 'node:fs';

const sources = globSync('src/**/*.tsx')
  .map(f => f.replaceAll('\\', '/'))
  .filter(f => !f.includes('.test.'));

describe('text is large enough to read', () => {
  /*
    `text-xs` is 12px and `text-[10px]` smaller still. Both sit at or under the
    floor Apple and Material describe — 11pt and 12sp respectively — which is a
    floor for incidental marks, not a size to set an interface in. The app's
    scale is 14 for secondary text and 16 for primary.
  */
  it('uses nothing below 14px', () => {
    const offenders = sources.flatMap(file => {
      const source = readFileSync(file, 'utf8');
      return [...source.matchAll(/text-xs\b|text-\[(\d+)px\]/g)]
        .filter(m => m[1] === undefined || Number(m[1]) < 14)
        .map(m => `${file}: ${m[0]}`);
    });
    expect(offenders).toEqual([]);
  });
});

describe('touch targets meet the platform figure', () => {
  /*
    Apple asks for 44×44pt, Material for 48×48dp. A control may be drawn
    smaller — a switch track is 24pt tall because that is what a switch looks
    like — but its *hit region* may not be, which is what `hitSlop` is for.

    So the rule is: a Pressable either sizes itself to the minimum, or says
    explicitly how it reaches it. What is banned is neither.
  */
  // Piano keys tiled exactly against each other and were the one exemption;
  // they now live in @sudobility/music_ui_rn and are guarded there.
  const EXEMPT = new Set<string>([]);

  it('every Pressable states a hit region or a minimum size', () => {
    const offenders = sources
      .filter(file => !EXEMPT.has(file))
      .filter(file => {
        const source = readFileSync(file, 'utf8');
        const pressables = (source.match(/<Pressable\b/g) ?? []).length;
        if (pressables === 0) return false;
        const sized =
          /hitSlop|MIN_TOUCH_TARGET|touchSlop|py-3|py-4|h-1[0-9]|h-[2-9][0-9]/.test(
            source,
          );
        return !sized;
      });
    expect(offenders).toEqual([]);
  });
});
