/**
 * The selected bar's properties — the web inspector's Bar tab.
 *
 * **Reflects and invokes, and decides nothing.** What each field offers and
 * what it commits is music_editing's `inspector.ts` and music_types' field
 * values, which the web's `measure-fields.tsx` reads too: the clefs a bar's
 * picker offers (`measureClefOptions`), what a typed tempo writes
 * (`commitBarTempo`), the pickup lengths (`pickupBeatOptions`), how "1, 2"
 * becomes a volta (`parseEndingNumbers`), the barlines (`BARLINE_OPTIONS`) and
 * the denominators a time signature may have. This tab used to work each of
 * those out inline, and had quietly parted from the web on three: the clef
 * picker read and wrote the **active** track rather than the bar's own, the
 * tempo field wrote an unrounded, unclamped value, and every per-bar field found
 * the bar's index on the *first* track — so a bar selected on any other part
 * edited bar 1.
 *
 * **Bar numbers, not indices.** `barNumberAt` skips pickups and answers `null`
 * for one, because a pickup has no number; nothing here computes `index + 1`.
 *
 * **One bar at a time for boundaries.** The time and key signatures apply to
 * the whole selection; tempo, clef, barline, navigation, pickup and repeats are
 * each a boundary at one bar, and applying one across a span would write the
 * same boundary onto every bar in it — so they are offered for a single bar,
 * as on the web.
 */
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useStore } from 'zustand';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Button, Input, Select, Switch, Text } from '@sudobility/components-rn';
import {
  commitBarTempo,
  measureClefOptions,
  removeTempoAt,
  selectEditLocked,
  selectSelectedMeasures,
  setBarline,
  setClefAtMeasure,
  setKeySignature,
  setNavigation,
  setPickup,
  setRepeats,
  setTimeSignature,
} from '@sudobility/music_editing';
import {
  BARLINE_OPTIONS,
  CLEF_LABEL_KEY,
  INHERIT_CLEF,
  KEY_MODE_OPTIONS,
  MAX_TIME_SIG_NUMERATOR,
  NO_JUMP,
  NO_PICKUP,
  REPEAT_JUMPS,
  REPEAT_JUMP_LABEL,
  SINGLE_BARLINE,
  TIME_SIG_DENOMINATOR_OPTIONS,
  barNumberAt,
  commonValue,
  formatEndingNumbers,
  keySignatureOptions,
  measureIndexOf,
  parseEndingNumbers,
  pickupBeatOptions,
  tempoAtBar,
  trackOfMeasure,
} from '@sudobility/music_types';
import type {
  BarlineStyle,
  Clef,
  KeySignature,
  KeySignatureOption,
  Measure,
  RepeatJump,
  ReplaceScope,
  Score,
} from '@sudobility/music_types';
import { DraftInput, NumberDraftInput } from './DraftInput';
import {
  FieldSlot,
  SLOT_FIELD_CLASS,
  SLOT_SELECT_CLASS,
} from '@/components/controls/FieldRow';
import { EmptyTab, Field } from './Field';
import { ReplaceButton } from './ReplaceButton';
import type { MusicDocument } from '@/documents/document';

type BarFieldProps = {
  document: MusicDocument;
  score: Score;
  measure: Measure;
  locked: boolean;
};

export function MeasureTab({
  document,
  onReplace,
}: {
  document: MusicDocument;
  onReplace?: (scope: ReplaceScope) => void;
}) {
  const { t } = useTranslation();
  const store = document.store;
  const measures = useStore(store, selectSelectedMeasures);
  const score = useStore(store, s => s.score);
  /*
    `selectEditLocked`, the same question the web tab asks: content is
    immutable while the transport plays, and every field here writes the score.
  */
  const locked = useStore(store, selectEditLocked);

  const first = measures[0];
  if (!score || !first)
    return <EmptyTab message={t('inspector.selectMeasure')} />;

  const measureIds = measures.map(m => m.id);
  const timeSig = commonValue(measures.map(m => m.timeSignature));
  const keySig: KeySignature | null = commonValue(
    measures.map(m => m.keySignature ?? { fifths: 0, mode: 'major' as const }),
  );
  const keyMode = keySig?.mode ?? 'major';

  /*
    The number a player reads. A bar selected across every track is one bar
    with several ids, so the numbers are made distinct before deciding between
    "Bar 3" and a range — the web's heading said "Bars 3–3" for that selection.
  */
  const grid = score.tracks[0]?.measures ?? [];
  const numbers = [
    ...new Set(
      measures
        .map(m => barNumberAt(grid, m.index))
        .filter((n): n is number => n !== null),
    ),
  ];
  const heading =
    numbers.length === 0
      ? t('inspector.pickup')
      : numbers.length > 1
        ? t('inspector.measureRange', {
            from: Math.min(...numbers),
            to: Math.max(...numbers),
          })
        : t('inspector.measureNumber', { number: numbers[0] });

  const single = measures.length === 1;

  return (
    <View className="gap-3">
      <Text className="text-foreground text-base font-semibold">{heading}</Text>

      {/*
        The numerator is typed (bounded by `MAX_TIME_SIG_NUMERATOR`); the
        denominator is a picker, because it is one of a handful of note values
        and there is no nearest one to snap a typed 3 to — `setTimeSignature`
        refuses it, so a free field would look live and then do nothing.
      */}
      <Field label={t('inspector.timeSignature')}>
        {/*
          One height for the two halves of one value. The field came at 33
          points and the picker at 36, so the fraction read as two controls
          that happened to be neighbours.
        */}
        <View className="flex-row items-center gap-2">
          <FieldSlot grow>
            <NumberDraftInput
              className={SLOT_FIELD_CLASS}
              value={timeSig?.numerator ?? null}
              min={1}
              max={MAX_TIME_SIG_NUMERATOR}
              integer
              editable={!locked}
              mixedPlaceholder={t('inspector.mixed')}
              accessibilityLabel={t('inspector.timeSigNumerator')}
              onCommit={numerator =>
                setTimeSignature(store, measureIds, {
                  numerator,
                  denominator: timeSig?.denominator ?? 4,
                })
              }
            />
          </FieldSlot>
          <Text className="text-muted-foreground text-base">/</Text>
          <View className="flex-1">
            <Select
              className={SLOT_SELECT_CLASS}
              value={timeSig ? String(timeSig.denominator) : ''}
              placeholder={t('inspector.mixed')}
              accessibilityLabel={t('inspector.timeSigDenominator')}
              disabled={locked}
              options={TIME_SIG_DENOMINATOR_OPTIONS.map(d => ({
                value: String(d),
                label: String(d),
              }))}
              onValueChange={(value: string) =>
                setTimeSignature(store, measureIds, {
                  numerator: timeSig?.numerator ?? 4,
                  denominator: Number(value),
                })
              }
            />
          </View>
        </View>
      </Field>

      {/*
        A key, named. "Key (fifths) 2" is the storage format; the reader is
        looking at D major. The options follow the chosen mode, because two
        sharps is D major or B minor depending on it — which is why the mode
        picker sits beside the key rather than under it.
      */}
      <Field label={t('inspector.key')}>
        <View className="flex-row gap-2">
          <View className="flex-1">
            <Select
              value={keySig ? String(keySig.fifths) : ''}
              placeholder={t('inspector.mixed')}
              accessibilityLabel={t('inspector.key')}
              disabled={locked}
              options={keySignatureOptions(keyMode).map(option => ({
                value: String(option.fifths),
                label: keyOptionLabel(t, option, keyMode),
              }))}
              onValueChange={(value: string) =>
                setKeySignature(store, measureIds, {
                  fifths: Number(value),
                  mode: keyMode,
                })
              }
            />
          </View>
          <View className="flex-1">
            <Select
              value={keySig?.mode ?? ''}
              placeholder={t('inspector.mixed')}
              accessibilityLabel={t('inspector.keyMode')}
              disabled={locked}
              options={KEY_MODE_OPTIONS.map(option => ({
                value: option.value,
                label: t(option.labelKey),
              }))}
              onValueChange={(value: string) =>
                setKeySignature(store, measureIds, {
                  fifths: keySig?.fifths ?? 0,
                  mode: value as KeySignature['mode'],
                })
              }
            />
          </View>
        </View>
      </Field>

      {single ? (
        <TempoField
          document={document}
          score={score}
          measure={first}
          locked={locked}
        />
      ) : null}
      {single ? (
        <ClefField
          document={document}
          score={score}
          measure={first}
          locked={locked}
        />
      ) : null}
      {single ? (
        <BarlineField
          document={document}
          score={score}
          measure={first}
          locked={locked}
        />
      ) : null}
      {single ? (
        <NavigationFields
          document={document}
          score={score}
          measure={first}
          locked={locked}
        />
      ) : null}
      {single && first.index === 0 ? (
        <PickupField
          document={document}
          score={score}
          measure={first}
          locked={locked}
        />
      ) : null}
      {single ? (
        <RepeatFields
          document={document}
          score={score}
          measure={first}
          locked={locked}
        />
      ) : null}

      {onReplace ? (
        <ReplaceButton
          document={document}
          scope="measures"
          label={t('inspector.replaceMeasures')}
          onReplace={onReplace}
        />
      ) : null}
    </View>
  );
}

/**
 * The tempo in force at this bar, and whether this bar sets it.
 *
 * Shows the tempo a player would count here — inherited from an earlier bar
 * when this one sets none — so it is never blank and never lies. `commitBarTempo`
 * parses, rounds and clamps, edits the bar's own event by id, and writes nothing
 * for blank text or the tempo already in force; when it declines, the draft goes
 * back to what the field showed. Remove is offered only for a change this bar
 * makes: the starting tempo is not a change, and removing it would leave the
 * score with no tempo at all.
 */
function TempoField({ document, score, measure, locked }: BarFieldProps) {
  const { t } = useTranslation();
  const here = tempoAtBar(score, measure);
  const shown = String(Math.round(here.bpm));
  const [draft, setDraft] = useState(shown);
  useEffect(() => setDraft(shown), [shown, measure.id]);

  const commit = () => {
    if (!commitBarTempo(document.store, measure, draft)) setDraft(shown);
  };

  return (
    <Field label={t('inspector.tempoHere')}>
      <DraftTextField
        value={draft}
        onChange={setDraft}
        onCommit={commit}
        editable={!locked}
        accessibilityLabel={t('inspector.tempoHere')}
      />
      {here.ownEventId && !here.isStarting ? (
        <Button
          variant="ghost"
          disabled={locked}
          onPress={() => {
            if (here.ownEventId) removeTempoAt(document.store, here.ownEventId);
          }}
        >
          {t('editor.removeTempoChange')}
        </Button>
      ) : (
        <Text className="text-muted-foreground text-sm">
          {here.ownEventId
            ? t('inspector.tempoStarting')
            : t('inspector.tempoInherited')}
        </Text>
      )}
    </Field>
  );
}

/**
 * The clef this bar reads in, on the bar's **own** track.
 *
 * `trackOfMeasure` and `measureClefOptions` answer which part and which clefs;
 * `setClefAtMeasure` writes it. Bar 1 establishes the part's clef rather than
 * changing it, so it offers no Inherit; a later bar shows its own change, or
 * Inherit, whose label names the clef in force.
 */
function ClefField({ document, score, measure, locked }: BarFieldProps) {
  const { t } = useTranslation();
  const track = trackOfMeasure(score, measure.id);
  if (!track) return null;
  const index = measureIndexOf(score, measure.id) ?? 0;
  const { value, inForce, options } = measureClefOptions(track, index);

  return (
    <Field label={t('inspector.measureClef')}>
      <Select
        value={value as string}
        accessibilityLabel={t('inspector.measureClef')}
        disabled={locked}
        options={options.map(option => ({
          value: option as string,
          label:
            option === INHERIT_CLEF
              ? t('inspector.clefInherit', { clef: t(CLEF_LABEL_KEY[inForce]) })
              : t(CLEF_LABEL_KEY[option]),
        }))}
        onValueChange={(next: string) =>
          setClefAtMeasure(
            document.store,
            measure.id,
            next === INHERIT_CLEF ? undefined : (next as Clef),
          )
        }
      />
    </Field>
  );
}

/**
 * The line this bar ends with: `BARLINE_OPTIONS`, single first, where single is
 * the absence of a style. The repeat barlines are independent flags and live in
 * `RepeatFields`.
 */
function BarlineField({ document, score, measure, locked }: BarFieldProps) {
  const { t } = useTranslation();
  const index = measureIndexOf(score, measure.id);
  if (index === null) return null;
  return (
    <Field label={t('inspector.barline')}>
      <Select
        value={measure.barline ?? SINGLE_BARLINE}
        accessibilityLabel={t('inspector.barline')}
        disabled={locked}
        options={BARLINE_OPTIONS.map(option => ({
          value: option.value,
          label: t(option.labelKey),
        }))}
        onValueChange={(value: string) =>
          setBarline(
            document.store,
            index,
            value === SINGLE_BARLINE ? undefined : (value as BarlineStyle),
          )
        }
      />
    </Field>
  );
}

/**
 * The navigation marks. The places are flags and the instruction is an enum;
 * `toCoda` and `coda` are separate on purpose — the bar you *leave* from is not
 * the bar the coda begins at. The jump labels are not translated: `D.S. al Coda`
 * is Italian on every edition.
 */
function NavigationFields({ document, score, measure, locked }: BarFieldProps) {
  const { t } = useTranslation();
  const index = measureIndexOf(score, measure.id);
  if (index === null) return null;
  const store = document.store;
  return (
    <>
      <Text className="text-muted-foreground text-sm">
        {t('inspector.navigation')}
      </Text>
      <Toggle
        label={t('inspector.segno')}
        checked={measure.segno === true}
        disabled={locked}
        onChange={checked => setNavigation(store, index, { segno: checked })}
      />
      <Toggle
        label={t('inspector.coda')}
        checked={measure.coda === true}
        disabled={locked}
        onChange={checked => setNavigation(store, index, { coda: checked })}
      />
      <Toggle
        label={t('inspector.toCoda')}
        checked={measure.toCoda === true}
        disabled={locked}
        onChange={checked => setNavigation(store, index, { toCoda: checked })}
      />
      <Toggle
        label={t('inspector.fine')}
        checked={measure.fine === true}
        disabled={locked}
        onChange={checked => setNavigation(store, index, { fine: checked })}
      />
      <Field label={t('inspector.jump')}>
        <Select
          value={measure.jump ?? NO_JUMP}
          accessibilityLabel={t('inspector.jump')}
          disabled={locked}
          options={[
            { value: NO_JUMP, label: t('inspector.jumpNone') },
            ...REPEAT_JUMPS.map(value => ({
              value,
              label: REPEAT_JUMP_LABEL[value],
            })),
          ]}
          onValueChange={(value: string) =>
            setNavigation(store, index, {
              jump: value === NO_JUMP ? undefined : (value as RepeatJump),
            })
          }
        />
      </Field>
    </>
  );
}

/**
 * The pickup, on bar 1 only — an anacrusis is the run-up to bar 1, and a short
 * bar elsewhere is an irregular bar that keeps its number.
 *
 * **A length, not a switch.** This was once a `Switch` that always wrote a
 * one-beat pickup, so a three-beat anacrusis could be written on the web and
 * not here. `pickupBeatOptions` answers the current length and every length
 * shorter than the bar, in beats, because that is how a musician says it.
 */
function PickupField({ document, score, measure, locked }: BarFieldProps) {
  const { t } = useTranslation();
  const { current, beats } = pickupBeatOptions(measure, score.ppq);
  return (
    <Field label={t('inspector.pickup')}>
      <Select
        value={current}
        accessibilityLabel={t('inspector.pickup')}
        disabled={locked}
        options={[
          { value: NO_PICKUP, label: t('inspector.pickupNone') },
          ...beats.map(count => ({
            value: String(count),
            label: t('inspector.pickupBeats', { count }),
          })),
        ]}
        onValueChange={(value: string) =>
          setPickup(document.store, value === NO_PICKUP ? null : Number(value))
        }
      />
    </Field>
  );
}

/**
 * The repeat barlines and volta. Two independent flags, not one span: a `:|`
 * with no matching `|:` repeats from the start of the piece. The volta is typed
 * as "1, 2" and parsed by `parseEndingNumbers`, which drops anything that is not
 * a pass number rather than storing a bracket nobody asked for.
 */
function RepeatFields({ document, measure, locked }: BarFieldProps) {
  const { t } = useTranslation();
  const store = document.store;
  return (
    <>
      <Text className="text-muted-foreground text-sm">
        {t('editor.repeats')}
      </Text>
      <Toggle
        label={t('editor.repeatStart')}
        checked={measure.repeatStart === true}
        disabled={locked}
        onChange={checked =>
          setRepeats(store, measure.id, { repeatStart: checked })
        }
      />
      <Toggle
        label={t('editor.repeatEnd')}
        checked={measure.repeatEnd === true}
        disabled={locked}
        onChange={checked =>
          setRepeats(store, measure.id, { repeatEnd: checked })
        }
      />
      <Field label={t('editor.ending')}>
        <DraftInput
          value={formatEndingNumbers(measure.endingNumbers)}
          placeholder={t('editor.endingPlaceholder')}
          accessibilityLabel={t('editor.ending')}
          editable={!locked}
          onCommit={text =>
            setRepeats(store, measure.id, {
              endingNumbers: parseEndingNumbers(text),
            })
          }
        />
      </Field>
      <Text className="text-muted-foreground text-sm">
        {t('editor.repeatsPlaybackNote')}
      </Text>
    </>
  );
}

/**
 * A text field whose draft the caller holds — the tempo's, which has to reset
 * its draft when the commit is declined, so `DraftInput`'s own draft will not
 * do.
 */
function DraftTextField({
  value,
  onChange,
  onCommit,
  editable,
  accessibilityLabel,
}: {
  value: string;
  onChange: (text: string) => void;
  onCommit: () => void;
  editable: boolean;
  accessibilityLabel: string;
}) {
  return (
    <Input
      value={value}
      onChangeText={onChange}
      onBlur={onCommit}
      onSubmitEditing={onCommit}
      keyboardType="numeric"
      editable={editable}
      accessibilityLabel={accessibilityLabel}
    />
  );
}

/**
 * A key picker entry, in the reader's language.
 *
 * `keySignatureOptions` answers the tonic and the count apart because "major",
 * "minor" and "2 sharps" are words a translator owns; its own `label` is the
 * English sentence this tab used to print straight into a Chinese build. The
 * tonic is a note name and reads the same everywhere. The web's
 * `keyOptionLabel`, with the web's keys.
 */
function keyOptionLabel(
  t: TFunction,
  option: KeySignatureOption,
  mode: KeySignature['mode'],
): string {
  const accidentals =
    option.accidentalKind === 'none'
      ? t('inspector.keyNoAccidentals')
      : t(
          option.accidentalKind === 'sharp'
            ? 'inspector.keySharps'
            : 'inspector.keyFlats',
          { count: option.accidentalCount },
        );
  return t(
    mode === 'minor' ? 'inspector.keyOptionMinor' : 'inspector.keyOptionMajor',
    { tonic: option.tonic, accidentals },
  );
}

function Toggle({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <View className="flex-row items-center justify-between">
      <Text className="text-foreground text-base">{label}</Text>
      <Switch
        checked={checked}
        disabled={disabled ?? false}
        onCheckedChange={onChange}
        accessibilityLabel={label}
      />
    </View>
  );
}
