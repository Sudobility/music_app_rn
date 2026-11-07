/**
 * Volume and pan, drawn as the things they are — the web app's mixer rows.
 *
 * The generic `Slider` is a good general control and a poor mixer one, for two
 * reasons this fixes, both of them `music_app`'s `mixer-controls.tsx`'s:
 *
 * - **Volume gave no sense of its range.** Its unfilled track is `bg-muted`,
 *   which against the property sheet's own surface is very nearly invisible —
 *   so a quiet track looked like a short bar floating in space, with nothing to
 *   say how much further it could go. Here the groove is always visible behind
 *   the fill, and a percent readout says the same thing in words.
 * - **Pan is not a number in a range.** It is a position between left and
 *   right, and the only readings that matter are which side and how far from
 *   centre. So it fills *from the middle*, marks the centre, and reads out
 *   "C" / "L40" / "R25" — a bar growing from the left said "40% of maximum
 *   pan", which is not a thing.
 *
 * Each owns its whole row — label, control, readout — rather than being dropped
 * into a row the caller builds. The two sit directly above one another in the
 * panel, so any difference between them reads as a mistake, and letting each
 * caller size its own label column is exactly how they diverged on the web: the
 * volume groove sat 14px left of the pan groove and ran 68px wider, because
 * "Volume" is a longer word than "Pan" and both rows were sizing to their own
 * text.
 */
import { View } from 'react-native';
import { MIN_TOUCH_TARGET, Text } from '@sudobility/components-rn';
import { LevelSlider, PositionSlider } from '@sudobility/music_ui_rn';
import { IconButton } from '@sudobility/music_ui_rn';
/*
  `panReadout` and `volumeReadout` are music_types', not this app's — they sit
  with the other "say a stored value the way a musician says it" conversions in
  `music-vocabulary.ts` — and so are `clampVolume` / `clampPan`, which also
  decide what a non-number means (silence and centre, never full level). Each
  was a few lines in music_app and a few identical lines here, which is the
  shape of thing that agrees right up until one side is edited.
*/
import {
  clampPan,
  clampVolume,
  panReadout,
  volumeReadout,
} from '@sudobility/music_types';

/** The row shape both controls use, stated once so the two cannot drift. */
const ROW_CLASS = 'flex-row items-center gap-2';
const ROW_LABEL_CLASS = 'text-muted-foreground w-16 shrink-0 text-sm';
const ROW_READOUT_CLASS =
  'text-muted-foreground w-12 shrink-0 text-right text-sm tabular-nums';

/**
 * The trailing action column.
 *
 * Only pan has anything to put in it, but both rows reserve it — otherwise the
 * pan groove would be a button's width shorter than the volume groove directly
 * above it, which is the misalignment this row shape exists to prevent.
 */
/** The trailing action column, at the platform minimum. */
const ROW_ACTION_WIDTH = MIN_TOUCH_TARGET;

export type MixerSliderProps = {
  /** The accessible name — what property of what this controls. */
  label: string;
  /** The visible text in the row's label column, which is shorter. */
  rowLabel: string;
  value: number;
  disabled?: boolean;
  onChange: (value: number) => void;
  /** Fired on release, for a caller that commits rather than tracks. */
  onCommit?: (value: number) => void;
};

/** 0 to 1, filled from the left, on a groove that shows the whole range. */
export function VolumeSlider({
  label,
  rowLabel,
  value,
  disabled,
  onChange,
  onCommit,
}: MixerSliderProps) {
  const clamped = clampVolume(value);
  return (
    <View className={ROW_CLASS}>
      <Text className={ROW_LABEL_CLASS}>{rowLabel}</Text>
      <LevelSlider
        className="flex-1"
        label={label}
        value={clamped}
        onChange={onChange}
        {...(onCommit ? { onSlidingComplete: onCommit } : {})}
        {...(disabled === undefined ? {} : { disabled })}
      />
      <Text className={ROW_READOUT_CLASS}>{volumeReadout(clamped)}</Text>
      <View style={{ width: ROW_ACTION_WIDTH }} />
    </View>
  );
}

export type PanSliderProps = MixerSliderProps & {
  /** Centres the pan. Omitted where there is nothing to commit to. */
  onReset?: () => void;
  /** The reset button's accessible name; the caller owns the words. */
  resetLabel: string;
};

/**
 * -1 to 1, as a position rather than a level.
 *
 * `PositionSlider` carries that distinction. Native sliders show the position
 * with their thumb; the Windows fallback also fills from the centre. The
 * readout beside it states which side of centre and how far.
 */
export function PanSlider({
  label,
  rowLabel,
  value,
  disabled,
  onChange,
  onCommit,
  onReset,
  resetLabel,
}: PanSliderProps) {
  const clamped = clampPan(value);
  const canReset = !disabled && clamped !== 0;

  return (
    <View className={ROW_CLASS}>
      <Text className={ROW_LABEL_CLASS}>{rowLabel}</Text>
      <PositionSlider
        className="flex-1"
        label={label}
        value={clamped}
        min={-1}
        max={1}
        {...(disabled === undefined ? {} : { disabled })}
        onChange={onChange}
        {...(onCommit ? { onSlidingComplete: onCommit } : {})}
      />
      <Text className={ROW_READOUT_CLASS}>{panReadout(clamped)}</Text>
      {onReset ? (
        // The app's icon button, in the column the volume row leaves empty:
        // it brings the touch slop, the pressed answer and the assistive
        // press (withheld while disabled) this used to write out by hand.
        <View
          className="items-center justify-center"
          style={{ width: ROW_ACTION_WIDTH, height: ROW_ACTION_WIDTH }}
        >
          <IconButton label={resetLabel} onPress={onReset} disabled={!canReset}>
            {/* A reset arrow: ⌖ was the obvious "centre" mark and was
                illegible at this size. */}
            <Text className="text-muted-foreground text-base">↺</Text>
          </IconButton>
        </View>
      ) : (
        <View style={{ width: ROW_ACTION_WIDTH }} />
      )}
    </View>
  );
}
