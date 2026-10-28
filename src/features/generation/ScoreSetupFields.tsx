/**
 * The New Project form's fields.
 *
 * The *rules* of the form are not here. They are music_lib's New Project draft
 * (`reduceNewProjectDraft` and its selectors), which the web dialog reads too:
 * what a style fills in, which rows it locks, when a singer is added and taken
 * back, how the duration and the bar count follow each other. This file used
 * to hold its own copy of all of it as a hook, `useScoreSetupDraft`, and the
 * copy had drifted in four ways a reader could hear or see — a style's tempo
 * and bars were taken straight off the preset (every salsa 190bpm for 168
 * bars), the key was never set (every generated score in C), New Project
 * opened at sixteen bars where the web opened at eight, and the lock fell on
 * "the first entry with an essential value", so a second kit the reader added
 * on purpose could be the one that locked. The roster was a `string[]` with no
 * ids, which is why the last of those could not be fixed here at all.
 *
 * So the component takes the draft and a `dispatch`, and does nothing but show
 * the one and call the other. Rows are keyed and addressed **by entry id**:
 * two violins is an ordinary ensemble, and "change the second violin" has to
 * mean that row whatever else moved.
 */
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Animated, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Button, Input, Select, Switch, Text } from '@sudobility/components-rn';
import {
  useScorePresets,
  useScoreStyleSettings,
} from '@sudobility/music_client';
import { publicServerContext } from '@/config/server';
import {
  FieldSlot,
  SLOT_BUTTON_CLASS,
  SLOT_SELECT_CLASS,
} from '@/components/controls/FieldRow';
import {
  DEFAULT_INSTRUMENT_VALUE,
  GENERATE_SCORE_COMPLEXITY_OPTIONS,
  GENERATE_SCORE_KEY_FIFTHS_OPTIONS,
  GENERATE_SCORE_MOOD_OPTIONS,
  GENERATE_SCORE_TIME_SIGNATURE_OPTIONS,
  canRemoveNewProjectEntry,
  complexityLabelKey,
  generationInstrumentOptionsFlat,
  isNewProjectEntryLocked,
  flatStyleOptions,
  labelledOptions,
  moodLabelKey,
  newProjectDefaultTitleKey,
  newProjectDurationRefused,
  newProjectTempoRefused,
  newProjectTempoRange,
  optionalFromPicker,
  optionalToPicker,
  showNewProjectDuration,
  showNewProjectLyrics,
  showNewProjectLyricsTheme,
  styleFamilyLabelKey,
  styleLabelKey,
  styleGenerationSettings,
} from '@sudobility/music_lib';
import type {
  GenerateScoreComplexity,
  NewProjectDraftAction,
  NewProjectFormDraft,
} from '@sudobility/music_lib';

/*
  The instrument menu, flattened, from music_types — the same groups and order
  the web picker draws with headings. A native `Select` has no group heading,
  so a melodic entry carries its family in the label instead. Built once: the
  catalogue does not change while the app runs.
*/
const INSTRUMENT_OPTIONS = generationInstrumentOptionsFlat();

/**
 * Fields that fade and slide in when they are wanted, and out when they are not.
 *
 * Mounted only while visible *or* still animating out, so a collapsed field is
 * genuinely gone — not merely transparent and still reachable. The web dialog
 * keeps its equivalent mounted and marks it `inert`, because CSS can animate a
 * height nobody stated in advance; React Native cannot without measuring, so
 * this animates opacity and a small offset and lets the layout reflow at once.
 *
 * **Not on the native driver.** It was, since opacity and a transform are
 * the two things that driver can animate. On macOS it left the block at the
 * opacity it was mounted with: the fields were there, laid out, taking their
 * space — and invisible, which is also untouchable, since a view under 1%
 * alpha is skipped by hit testing. Turning "Generate for me" on opened a
 * blank gap where the prompt and the style pickers should have been. Two
 * hundred milliseconds of a fade is not work the JS thread needs sparing.
 */
function Reveal({ shown, children }: { shown: boolean; children: ReactNode }) {
  const [mounted, setMounted] = useState(shown);
  const progress = useRef(new Animated.Value(shown ? 1 : 0)).current;

  useEffect(() => {
    if (shown) setMounted(true);
    const animation = Animated.timing(progress, {
      toValue: shown ? 1 : 0,
      duration: REVEAL_MS,
      useNativeDriver: false,
    });
    animation.start(({ finished }) => {
      // Unmounted only once the fade has actually finished: cut short by a
      // second toggle, `finished` is false and the block stays for the
      // animation now running the other way.
      if (finished && !shown) setMounted(false);
    });
    return () => animation.stop();
  }, [shown, progress]);

  if (!mounted) return null;
  return (
    <Animated.View
      style={{
        opacity: progress,
        transform: [
          {
            translateY: progress.interpolate({
              inputRange: [0, 1],
              outputRange: [-8, 0],
            }),
          },
        ],
      }}
    >
      {children}
    </Animated.View>
  );
}

/** Long enough to read as motion, short enough not to be waited on. */
const REVEAL_MS = 200;

export type ScoreSetupFieldsProps = {
  draft: NewProjectFormDraft;
  dispatch: (action: NewProjectDraftAction) => void;
  /** Placed under the title, where the web dialog puts "Generate for me". */
  generateToggle?: ReactNode;
};

export function ScoreSetupFields({
  draft,
  dispatch,
  generateToggle,
}: ScoreSetupFieldsProps) {
  const { t, i18n } = useTranslation();
  const serverContext = publicServerContext();
  /*
    The briefs the server offers for this style.

    `i18n.exists` filters what arrives: a server one version ahead of this app
    would otherwise offer a brief's id as its own label. The value carried is
    the *text*, because that text is the prompt.
  */
  const { data: presetKeys } = useScorePresets(
    serverContext,
    draft.style || undefined,
  );
  const { data: styleSettings } = useScoreStyleSettings(serverContext);
  const localTempoRange = newProjectTempoRange(draft);
  const styleSetting = draft.style
    ? (styleSettings?.[draft.style] ?? styleGenerationSettings(draft.style))
    : null;
  const tempoMin = styleSetting?.minBpm ?? localTempoRange?.[0] ?? 40;
  const tempoMax = styleSetting?.maxBpm ?? localTempoRange?.[1] ?? 240;
  const keyOptions = GENERATE_SCORE_KEY_FIFTHS_OPTIONS.filter(
    option => !styleSetting || styleSetting.keys.includes(option.fifths),
  );
  const modeOptions = (['major', 'minor'] as const).filter(
    mode => !styleSetting?.mode || styleSetting.mode === mode,
  );
  const meterOptions = Object.keys(
    GENERATE_SCORE_TIME_SIGNATURE_OPTIONS,
  ).filter(meter => !styleSetting || styleSetting.timeSignature === meter);
  const presets = (presetKeys ?? [])
    .filter(key => i18n.exists(`generateScore.preset.${key}`))
    .map(key => ({
      value: t(`generateScore.preset.${key}`),
      label: t(`generateScore.preset.${key}`),
    }));

  /*
    Style and mood as the reader scans them: sorted on the translated label
    under the language on screen, with the "none" entry pinned above rather
    than filed between "New Age" and "Pop", each style prefixed with its family
    since a native Select draws no headings. Shared with
    the web pickers. The draft holds `''` for none; the picker holds `NO_MARK`,
    and `optionalToPicker`/`optionalFromPicker` are the two directions.
  */
  const styleOptions = flatStyleOptions(
    value => t(styleLabelKey(value)),
    family => t(styleFamilyLabelKey(family)),
    i18n.language,
    t('generateScore.noStyle'),
  );
  const moodOptions = labelledOptions(
    GENERATE_SCORE_MOOD_OPTIONS,
    value => t(moodLabelKey(value)),
    i18n.language,
    t('generateScore.noMood'),
  );
  // Declaration order, not sorted: simple, moderate, complex is a scale, and
  // alphabetising it would put "complex" first.
  const complexityOptions = GENERATE_SCORE_COMPLEXITY_OPTIONS.map(value => ({
    value,
    label: t(complexityLabelKey(value)),
  }));

  const lockedLabel = t('generateScore.essential');
  const defaultTitle = t(newProjectDefaultTitleKey(draft));

  return (
    <>
      <Field label={t('generateScore.titleField')}>
        <Input
          value={draft.title}
          onChangeText={title => dispatch({ type: 'setTitle', title })}
          placeholder={defaultTitle}
          accessibilityLabel={t('generateScore.titleField')}
        />
      </Field>

      {/* The caller's own control, if it has one — New Project's "Generate for
          me" — in the place the web dialog puts it: under the title, above
          everything it reveals. */}
      {generateToggle ?? null}

      <Reveal shown={draft.generating}>
        <Field label={t('generate.prompt')}>
          <Input
            value={draft.prompt}
            onChangeText={prompt => dispatch({ type: 'setPrompt', prompt })}
            multiline
            numberOfLines={3}
            accessibilityLabel={t('generate.prompt')}
          />
        </Field>

        {/* A starting point, chosen from the briefs the server offers for the
            style in hand. Rendered only when a list has arrived. */}
        {presets.length > 0 ? (
          <Field label={t('generateScore.presetPrompts')}>
            <Select
              value=""
              placeholder={t('generate.presets')}
              accessibilityLabel={t('generateScore.presetPrompts')}
              options={presets}
              onValueChange={prompt => dispatch({ type: 'setPrompt', prompt })}
            />
          </Field>
        ) : null}

        <Row>
          <Field label={t('generateScore.style')} grow>
            <Select
              value={optionalToPicker(draft.style)}
              accessibilityLabel={t('generateScore.style')}
              options={styleOptions}
              onValueChange={value =>
                dispatch({
                  type: 'applyStyle',
                  style: optionalFromPicker(value),
                })
              }
            />
          </Field>
          <Field label={t('generateScore.mood')} grow>
            <Select
              value={optionalToPicker(draft.mood)}
              accessibilityLabel={t('generateScore.mood')}
              options={moodOptions}
              onValueChange={value =>
                dispatch({ type: 'setMood', mood: optionalFromPicker(value) })
              }
            />
          </Field>
          <Field label={t('generateScore.complexity')} grow>
            <Select
              value={draft.complexity}
              accessibilityLabel={t('generateScore.complexity')}
              options={complexityOptions}
              onValueChange={value =>
                dispatch({
                  type: 'setComplexity',
                  complexity: value as GenerateScoreComplexity,
                })
              }
            />
          </Field>
        </Row>

        {/* Only where somebody can sing them: syllables under a bass line are
            not a lyric. music_lib drops the field from the request otherwise,
            rather than trusting this to stay in step with the roster. */}
        {showNewProjectLyrics(draft) ? (
          <View className="flex-row items-center gap-3 pb-3">
            <Switch
              checked={draft.lyrics}
              onCheckedChange={lyrics =>
                dispatch({ type: 'setLyrics', lyrics })
              }
              accessibilityLabel={t('newProject.writeLyrics')}
            />
            <View className="flex-1">
              <Text className="text-foreground text-base">
                {t('newProject.writeLyrics')}
              </Text>
              <Text className="text-muted-foreground text-sm">
                {t('newProject.writeLyricsHint')}
              </Text>
            </View>
          </View>
        ) : null}

        {showNewProjectLyricsTheme(draft) ? (
          <Field label={t('newProject.lyricsTheme')}>
            <Input
              value={draft.lyricsTheme}
              onChangeText={lyricsTheme =>
                dispatch({ type: 'setLyricsTheme', lyricsTheme })
              }
              placeholder={t('newProject.lyricsThemePlaceholder')}
              accessibilityLabel={t('newProject.lyricsTheme')}
            />
          </Field>
        ) : null}
      </Reveal>

      {/*
        One picker per part, in order: a score has an ordered instrumentation,
        and the same instrument twice is a perfectly ordinary request. A part
        can be removed unless it is the last, or the chosen style cannot do
        without it while a model writes the music.
      */}
      <Field label={t('generateScore.instrumentation')}>
        <View className="gap-2">
          {draft.ensemble.map(entry => {
            const locked = isNewProjectEntryLocked(draft, entry);
            return (
              // The picker and the button that removes it, at one height:
              // they came at 36 and 32 points.
              <View key={entry.id} className="flex-row items-center gap-2">
                <View className="flex-1">
                  <Select
                    className={SLOT_SELECT_CLASS}
                    value={entry.value}
                    accessibilityLabel={t('generateScore.instrumentation')}
                    options={INSTRUMENT_OPTIONS}
                    disabled={locked}
                    onValueChange={value =>
                      dispatch({
                        type: 'replaceInstrument',
                        id: entry.id,
                        value,
                      })
                    }
                  />
                </View>
                {locked ? (
                  <Text className="text-muted-foreground text-sm">
                    {lockedLabel}
                  </Text>
                ) : (
                  <FieldSlot>
                    <Button
                      variant="ghost"
                      className={SLOT_BUTTON_CLASS}
                      disabled={!canRemoveNewProjectEntry(draft, entry)}
                      accessibilityLabel={t('generateScore.removeInstrument', {
                        instrument:
                          INSTRUMENT_OPTIONS.find(
                            option => option.value === entry.value,
                          )?.label ?? entry.value,
                      })}
                      onPress={() =>
                        dispatch({ type: 'removeInstrument', id: entry.id })
                      }
                    >
                      ✕
                    </Button>
                  </FieldSlot>
                )}
              </View>
            );
          })}
          <View className="flex-row">
            <Button
              variant="outline"
              size="sm"
              onPress={() =>
                dispatch({
                  type: 'addInstrument',
                  value: DEFAULT_INSTRUMENT_VALUE,
                })
              }
            >
              {t('generateScore.addInstrument')}
            </Button>
          </View>
        </View>
      </Field>

      <Row>
        <Field label={t('generateScore.measures')} grow>
          <Input
            value={draft.measuresText}
            onChangeText={text => dispatch({ type: 'setBars', text })}
            keyboardType="number-pad"
            accessibilityLabel={t('generateScore.measures')}
          />
        </Field>
        {/* Hidden while a model writes words: a song's length is its form,
            and the lyric follows verses and choruses rather than a clock. */}
        {showNewProjectDuration(draft) ? (
          <Field
            label={t('generateScore.duration')}
            grow
            {...(newProjectDurationRefused(draft)
              ? { hint: t('generateScore.durationInvalid') }
              : {})}
          >
            <Input
              value={draft.durationText}
              onChangeText={text => dispatch({ type: 'setDuration', text })}
              onBlur={() => dispatch({ type: 'tidyDuration' })}
              accessibilityLabel={t('generateScore.duration')}
            />
          </Field>
        ) : null}
        <Field
          label={t('generateScore.tempo')}
          grow
          {...(newProjectTempoRefused(draft)
            ? { hint: t('generateScore.tempoInvalid') }
            : {})}
        >
          <Input
            value={draft.tempoText}
            onChangeText={text => dispatch({ type: 'setTempo', text })}
            onBlur={() => {
              if (!styleSetting) return;
              const tempo = Number(draft.tempoText);
              if (!Number.isInteger(tempo) || tempo <= 0) return;
              dispatch({
                type: 'setTempo',
                text: String(Math.min(tempoMax, Math.max(tempoMin, tempo))),
              });
            }}
            keyboardType="number-pad"
            accessibilityLabel={t('generateScore.tempo')}
          />
        </Field>
      </Row>

      <Row>
        <Field label={t('generateScore.key')} grow>
          <Select
            value={String(draft.keySignature.fifths)}
            accessibilityLabel={t('generateScore.key')}
            options={keyOptions.map(option => ({
              value: String(option.fifths),
              label: option.label,
            }))}
            onValueChange={value =>
              dispatch({ type: 'setKey', fifths: Number(value) })
            }
          />
        </Field>
        <Field label={t('generateScore.mode')} grow>
          <Select
            value={draft.keySignature.mode}
            accessibilityLabel={t('generateScore.mode')}
            options={modeOptions.map(mode => ({
              value: mode,
              label: t(`key.${mode}`),
            }))}
            onValueChange={value =>
              dispatch({ type: 'setMode', mode: value as 'major' | 'minor' })
            }
          />
        </Field>
        <Field label={t('generateScore.timeSignature')} grow>
          <Select
            value={draft.meter}
            accessibilityLabel={t('generateScore.timeSignature')}
            options={meterOptions.map(value => ({ value, label: value }))}
            onValueChange={meter => dispatch({ type: 'setMeter', meter })}
          />
        </Field>
      </Row>
    </>
  );
}

/** Controls side by side, as the web dialog lays them out — one per row wasted the width. */
function Row({ children }: { children: ReactNode }) {
  return <View className="flex-row gap-2">{children}</View>;
}

function Field({
  label,
  children,
  grow = false,
  hint,
}: {
  label: string;
  children: ReactNode;
  /** Shares a row's width with its neighbours. */
  grow?: boolean;
  /** Shown under the control when what was typed is refused. */
  hint?: string;
}) {
  return (
    <View className={grow ? 'min-w-0 flex-1 gap-1 pb-3' : 'gap-1 pb-3'}>
      <Text className="text-muted-foreground text-sm">{label}</Text>
      {children}
      {hint ? <Text className="text-destructive text-sm">{hint}</Text> : null}
    </View>
  );
}
