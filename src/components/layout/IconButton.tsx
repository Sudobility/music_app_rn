/**
 * An icon button in the title bar.
 *
 * The web app has `ICON_BUTTON_CLASS` for exactly this — one stated size for
 * every glyph in the bar, because a row of buttons that each size themselves
 * from their own content comes out ragged. Same reasoning here, and the same
 * height.
 */
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable } from 'react-native';
import { MIN_TOUCH_TARGET } from '@sudobility/components-rn';
import { useNotationInk } from '@/components/icons/notation-ink';

export type IconButtonProps = {
  /**
   * The control's *name* — "Copy", not "Duplicate the selection".
   *
   * A screen reader reads this to announce what the button is, so it has to be
   * the short name. Anything longer belongs in `hint`, which is read after it
   * and describes what pressing will do — the same split the web bar makes
   * between `aria-label` and its tooltip.
   */
  label: string;
  hint?: string;
  onPress: () => void;
  disabled?: boolean;
  /**
   * On for a control that is a toggle rather than an action.
   *
   * It reports `selected` to the accessibility layer as well as tinting, so a
   * screen reader says whether note input is on — the tint alone says it only
   * to somebody looking at it.
   */
  selected?: boolean;
  /**
   * Fill the button red while `selected`, rather than leaving the glyph to say
   * it — for an on/off switch (see `FILLED`). The caller draws its glyph in
   * inverse ink when on.
   */
  fill?: boolean;
  /**
   * The button's work is under way: the glyph becomes a spinner, the button
   * refuses a second press (and the assistive activation with it), and
   * `busy` is reported to the accessibility layer.
   */
  loading?: boolean;
  /**
   * The spinner's ink. A colour must be passed rather than inherited, so it
   * comes from `useNotationInk()`: the bar's ordinary `foreground` unless the
   * button sits on `bg-primary` (the title bar), which passes `onPrimary`.
   */
  spinnerColor?: string;
  children: ReactNode;
};

/*
  Whole class strings, never a template with a hole in it: Tailwind extracts
  classes by scanning source text, so an interpolated variant never appears
  whole in the file and is silently never generated. It fails quietly — the
  colours still work, the layout does not.
*/
const BASE = 'rounded-md items-center justify-center active:opacity-40';
const DISABLED = 'rounded-md items-center justify-center opacity-40';
/*
  Selection is a *colour*, and this used to paint a grey chip behind one.

  Every selected control in this app already says so in the accent: the toolbar
  chips fill red with inverse ink, and the loop, metronome, note-input and
  inspector toggles tint their glyph red. A grey background underneath was the
  same fact stated twice — and stated in a second visual language, so a
  red-on-grey control read as two overlapping states rather than one. The
  button keeps its shape; `accessibilityState.selected` still carries the fact
  to anything not looking at it.
*/
const SELECTED = 'rounded-md items-center justify-center active:opacity-40';
/*
  The exception: a control that *is* an on/off switch for something on screen —
  the piano keyboard — fills red when on, with inverse ink, the way the toolbar
  chips do. Tinting the glyph alone read as "selected" rather than "on".
*/
const FILLED =
  'rounded-md items-center justify-center bg-primary active:opacity-40';

/**
 * The button is the platform's minimum touch target — 44pt on iOS/macOS, 48dp
 * on Android — in both width and height, with the 18px glyph centred in it.
 *
 * It used to be drawn at 30pt and brought up to the minimum with `hitSlop`,
 * so it *looked* smaller than it responded. The bars that could not hold a
 * full-size control (the editing bar and the playback bar) wrap to more rows
 * now, and the ones with too many controls for a phone group the rest into a
 * menu rather than shrinking the buttons.
 */
// A plain object, never a `style` *function*: NativeWind silently drops a
// function passed alongside `className` (the min size then never applied and
// the buttons stayed content-narrow). The pressed dim is a className `active:`
// variant below instead.
const SIZE_STYLE = {
  minWidth: MIN_TOUCH_TARGET,
  minHeight: MIN_TOUCH_TARGET,
} as const;

/**
 * What the button does while the finger is still down.
 *
 * It used to do nothing: the glyph only changed once the touch *ended*, which
 * reads as a control that did not notice the press — and on a slow frame as
 * one that ignored it entirely. Every native button on both platforms answers
 * on touch-**down**, and each answers in its own way, so this is two answers
 * rather than one drawn compromise.
 *
 * Android gets `android_ripple`, which is the platform's own `RippleDrawable`
 * — drawn by the OS, from the touch point outwards, on the UI thread, so it
 * appears even while JavaScript is busy. `borderless` is right for a bar
 * glyph: the ripple is a circle around the icon rather than a filled rounded
 * rectangle, which is what Material specifies for an icon button.
 *
 * iOS has no ripple. A `UIBarButtonItem` dims to about half alpha the instant
 * it is touched and restores on release, and that is what the pressed opacity
 * below is. Deliberately *not* `TouchableOpacity`, whose 150ms fade is its own
 * invention rather than UIKit's — a bar glyph there responds immediately.
 */
const RIPPLE = { borderless: true, radius: MIN_TOUCH_TARGET / 2 } as const;
/** The glyph's own box, so a spinning button keeps the bar's rhythm. */
const SPINNER_STYLE = { width: 18, height: 18 } as const;

export function IconButton({
  label,
  hint,
  onPress,
  disabled = false,
  selected = false,
  fill = false,
  loading = false,
  spinnerColor,
  children,
}: IconButtonProps) {
  const ink = useNotationInk();
  // Waiting is refusing: a second press while the first is in flight is the
  // double submit the spinner exists to prevent. Drawn at full strength,
  // though — a spinner at 40% reads as a control that is off.
  const inert = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      {...(hint ? { accessibilityHint: hint } : {})}
      accessibilityState={{ disabled: inert, selected, busy: loading }}
      onPress={onPress}
      // macOS has no synthesized-touch fallback for an assistive press, so a
      // VoiceOver press would otherwise do nothing.
      {...(inert ? {} : { onAccessibilityTap: onPress })}
      disabled={inert}
      android_ripple={RIPPLE}
      className={
        disabled ? DISABLED : selected ? (fill ? FILLED : SELECTED) : BASE
      }
      style={SIZE_STYLE}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={spinnerColor ?? ink.foreground}
          style={SPINNER_STYLE}
        />
      ) : (
        children
      )}
    </Pressable>
  );
}
