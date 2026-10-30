/**
 * Whether the editing and playback bars collapse to their compact arrangement
 * — the note-entry essentials on the bar and everything else behind a "…"
 * sheet — rather than showing every control inline.
 *
 * It is a size-class question, not a device one. A phone is always compact:
 * thirty-odd full-size touch targets never fit its width, in either
 * orientation, which is why a wide iPhone in landscape still collapses. Every
 * other device — an iPad, a Mac or a Windows window — is compact only while its
 * window is narrow, so the bars collapse when an iPad is resized into a split
 * view or a desktop window is dragged small, and open back up when it is
 * widened. The width is the bar's own measured width (`useContainerSize`),
 * never `useWindowDimensions`, which reports the display on macOS and does not
 * update for a window that is not fullscreen.
 *
 * `COMPACT_BAR_MAX_WIDTH` is the compact/regular boundary — the same ~600pt at
 * which the iPad's horizontal size class flips to compact and the master/detail
 * split view collapses to one column — so a window narrow enough to collapse
 * the split view collapses the bars with it.
 *
 * Pure, and a module of its own, so vitest can hold the rule down.
 */

/** The form factors `useFormFactor` reports; a type-only copy keeps this pure. */
export type BarFormFactor = 'phone' | 'tablet' | 'desktop';

/** The window width below which a tablet/desktop is compact, as the iPad is. */
export const COMPACT_BAR_MAX_WIDTH = 600;

export function barsCompact(formFactor: BarFormFactor, width: number): boolean {
  // A phone is compact in any orientation — its landscape width is wide enough
  // to clear the threshold below, but not to fit the full bar.
  if (formFactor === 'phone') return true;
  // Unmeasured (0) reads as not compact, so a tablet/desktop shows the full bar
  // until the first layout rather than flashing collapsed; a phone has already
  // answered above.
  return width > 0 && width < COMPACT_BAR_MAX_WIDTH;
}
