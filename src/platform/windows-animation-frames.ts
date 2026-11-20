/**
 * RNW's Composition host emulates RAF with immediate UI dispatcher posts.
 * Bound frame work to the display cadence so playback cannot flood that queue.
 * A timeout also keeps working across scroll/layout transitions.
 *
 * Two things about RNW's timers decide the shape of this:
 *
 * - **A fixed 16.7ms delay is a 32fps clock.** Timers are `DispatcherQueueTimer`
 *   intervals, truncated to whole milliseconds and fired on the system tick
 *   (~15.6ms), so 16ms lands on the second tick. Each frame is therefore
 *   aimed at a grid, `FRAME_MS` after the last one ran: a request made just
 *   after a frame waits ~15ms (one tick), one made late waits next to nothing.
 * - **Every timer is a UI-thread post** to create and another to fire. The
 *   cursor, the canvas's paint, the player's lit-notes ticker and the keyboard
 *   each ask for frames, so one timer serves every request made before it
 *   fires, as a browser's frame does.
 */
const FRAME_MS = 1000 / 60;
/** RNW reads a one-shot 1ms timer as an animation-frame request and posts it at once. */
const MIN_DELAY_MS = 2;

export function installWindowsAnimationFrames() {
  let pending = new Map<number, (time: number) => void>();
  let nextHandle = 1;
  let scheduled = false;
  let lastFrameAt = Number.NEGATIVE_INFINITY;

  const runFrame = () => {
    scheduled = false;
    const callbacks = pending;
    pending = new Map();
    const now = performance.now();
    lastFrameAt = now;
    callbacks.forEach(callback => {
      try {
        callback(now);
      } catch (error) {
        // One failing callback must not starve the rest of the frame.
        setTimeout(() => {
          throw error;
        }, 0);
      }
    });
  };

  globalThis.requestAnimationFrame = callback => {
    const handle = nextHandle++;
    pending.set(handle, callback);
    if (!scheduled) {
      scheduled = true;
      const wait = lastFrameAt + FRAME_MS - performance.now();
      setTimeout(runFrame, Math.max(MIN_DELAY_MS, wait));
    }
    return handle;
  };
  globalThis.cancelAnimationFrame = handle => {
    if (handle != null) pending.delete(handle);
  };
}
