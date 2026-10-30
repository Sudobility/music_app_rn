/**
 * When the editing and playback bars collapse — a size-class question.
 *
 * The rule has to separate three cases that a single width cannot: a phone
 * (always compact, even in landscape, where it is wider than a narrow iPad
 * window that stays regular), a wide tablet/desktop (inline), and a narrow
 * tablet/desktop window such as an iPad split view (compact). So the device and
 * the measured width are both read, and this pins each case.
 */
import { describe, expect, it } from 'vitest';
import { barsCompact, COMPACT_BAR_MAX_WIDTH } from './compact-bars';

describe('barsCompact', () => {
  it('collapses a phone at any width', () => {
    expect(barsCompact('phone', 0)).toBe(true);
    expect(barsCompact('phone', 390)).toBe(true);
    // An iPhone Max in landscape is wider than the tablet threshold, and still
    // collapses — thirty controls do not fit it either.
    expect(barsCompact('phone', 932)).toBe(true);
  });

  it('keeps a wide tablet or desktop window inline', () => {
    expect(barsCompact('tablet', 1024)).toBe(false);
    expect(barsCompact('desktop', 1280)).toBe(false);
    // The boundary itself is regular: compact is strictly narrower.
    expect(barsCompact('tablet', COMPACT_BAR_MAX_WIDTH)).toBe(false);
  });

  it('collapses a narrow tablet or desktop window', () => {
    expect(barsCompact('tablet', COMPACT_BAR_MAX_WIDTH - 1)).toBe(true);
    expect(barsCompact('tablet', 375)).toBe(true);
    expect(barsCompact('desktop', 500)).toBe(true);
  });

  it('shows the full bar on a tablet or desktop until it is measured', () => {
    // Width 0 is "not laid out yet"; default to inline rather than flash
    // collapsed on a wide window.
    expect(barsCompact('tablet', 0)).toBe(false);
    expect(barsCompact('desktop', 0)).toBe(false);
  });
});
