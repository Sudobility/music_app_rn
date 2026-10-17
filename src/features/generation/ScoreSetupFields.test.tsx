/**
 * The New Project fields draw the draft they are handed, and address rows by id.
 *
 * The rules live in music_lib's `reduceNewProjectDraft` and are tested there;
 * what can go wrong *here* is the drawing. The native form used to keep its
 * own copy of the draft as a hook, and four of its bugs were a field showing
 * something other than what would be sent — a style's drawn tempo and bars, a
 * key that was never set, sixteen bars where the web opened at eight, a lock on
 * the wrong kit. So each test builds a draft through the shared reducer and
 * asserts that the screen says the same thing.
 *
 * The pickers are asserted on their triggers, which print the chosen option's
 * label: a native `Select` opens a modal a test environment does not mount, so
 * the trigger is the one honest place to read a picker's value.
 */
import { jest } from '@jest/globals';
import { useReducer } from 'react';
import { fireEvent } from '@testing-library/react-native';
import {
  DEFAULT_GENERATE_SCORE_MEASURES,
  GENERATE_SCORE_KEY_FIFTHS_OPTIONS,
  initialNewProjectDraft,
  reduceNewProjectDraft,
} from '@sudobility/music_lib';
import type {
  NewProjectDraftAction,
  NewProjectFormDraft,
} from '@sudobility/music_lib';
import { renderWithApp } from '@/test/render';
import { ScoreSetupFields } from './ScoreSetupFields';

const mockUseScoreStyleSettings = jest.fn<() => { data: unknown }>(() => ({
  data: undefined,
}));
jest.mock('@sudobility/music_client', () => {
  const actual = jest.requireActual('@sudobility/music_client') as Record<
    string,
    unknown
  >;
  return {
    ...actual,
    useScorePresets: () => ({ data: undefined }),
    useScoreStyleSettings: () => mockUseScoreStyleSettings(),
  };
});

/** A fixed draw, so a style's tempo, key and roster are the same every run. */
const rng = () => 0.5;

function reduce(
  draft: NewProjectFormDraft,
  ...actions: NewProjectDraftAction[]
): NewProjectFormDraft {
  return actions.reduce((d, a) => reduceNewProjectDraft(d, a, rng), draft);
}

let latest: NewProjectFormDraft;

function Harness({ initial }: { initial: NewProjectFormDraft }) {
  const [draft, dispatch] = useReducer(
    (d: NewProjectFormDraft, a: NewProjectDraftAction) =>
      reduceNewProjectDraft(d, a, rng),
    initial,
  );
  latest = draft;
  return <ScoreSetupFields draft={draft} dispatch={dispatch} />;
}

function setup(initial: NewProjectFormDraft = initialNewProjectDraft()) {
  return renderWithApp(<Harness initial={initial} />);
}

const reggae = () =>
  reduce(
    initialNewProjectDraft(),
    { type: 'setGenerating', generating: true },
    { type: 'applyStyle', style: 'reggae' },
  );

describe('ScoreSetupFields', () => {
  it('opens at the shared default length, not a bar count of its own', () => {
    const view = setup();
    expect(view.getByLabelText('Bars').props.value).toBe(
      String(DEFAULT_GENERATE_SCORE_MEASURES),
    );
  });

  it('draws the tempo, bars and key a style chose', () => {
    // The preset's own tempo and bars used to be drawn while a different draw
    // was what the style meant, and the key was never set at all.
    const draft = reggae();
    const view = setup(draft);
    expect(view.getByLabelText('Bars').props.value).toBe(draft.measuresText);
    expect(view.getByLabelText('Tempo').props.value).toBe(draft.tempoText);
    const key = GENERATE_SCORE_KEY_FIFTHS_OPTIONS.find(
      option => option.fifths === draft.keySignature.fifths,
    );
    expect(view.getAllByText(key!.label).length).toBeGreaterThan(0);
  });

  it('shows backend style bounds and clamps an out-of-range native tempo', () => {
    mockUseScoreStyleSettings.mockReturnValue({
      data: {
        ambient: {
          tempo: 70,
          minBpm: 68,
          maxBpm: 72,
          timeSignature: '4/4',
          keys: [0],
          mode: 'major',
        },
      },
    });
    const draft = reduce(initialNewProjectDraft(), {
      type: 'applyStyle',
      style: 'ambient',
    });
    const view = setup(draft);
    const tempo = view.getByLabelText('Tempo');
    fireEvent.changeText(tempo, '65');
    fireEvent(tempo, 'blur');
    expect(latest.tempoText).toBe('68');
  });

  it('labels the style and the complexity rather than printing their values', () => {
    const view = setup(reggae());
    // The style carries its family in the label, the way the web picker groups
    // it under a heading (`flatStyleOptions`).
    expect(view.getByText('Latin & Caribbean · Reggae')).toBeTruthy();
    expect(view.getByText('Moderate')).toBeTruthy();
    expect(view.queryByText('moderate')).toBeNull();
  });

  it('offers the lyric language while words are being written, open on English', () => {
    // reggae() turns generation on, which adds a singer, so lyrics are on and
    // the language picker shows beside the theme. Undefined means English — the
    // generation prompt's own default — so the trigger reads "English".
    const view = setup(reggae());
    expect(view.getByText('Language of the words')).toBeTruthy();
    expect(view.getByLabelText('Language of the words')).toBeTruthy();
    expect(view.getByText('English')).toBeTruthy();
  });

  it('hides the lyric language when no words are being written', () => {
    // A plain instrumental draft: no singer, so no lyrics and no language.
    const view = setup();
    expect(view.queryByText('Language of the words')).toBeNull();
  });

  it('locks exactly the rows the style made essential', () => {
    const draft = reggae();
    const essentials = draft.ensemble.filter(e => e.tier === 'essential');
    expect(essentials.length).toBeGreaterThan(0);
    const view = setup(draft);
    expect(view.getAllByText('(essential)')).toHaveLength(essentials.length);
  });

  it('never locks a second copy of an essential instrument added by hand', () => {
    // The old hook locked "the first entry with an essential value", so which
    // row locked depended on order rather than on who put it there.
    const draft = reggae();
    const essential = draft.ensemble.find(e => e.tier === 'essential')!;
    const view = setup(
      reduce(draft, { type: 'addInstrument', value: essential.value }),
    );
    expect(view.getAllByText('(essential)')).toHaveLength(
      draft.ensemble.filter(e => e.tier === 'essential').length,
    );
  });

  it('removes the row that was pressed, by id, when two rows match', () => {
    // Two pianos: removing the second must leave the first, which a list of
    // bare values cannot tell apart.
    const draft = reduce(initialNewProjectDraft(), {
      type: 'addInstrument',
      value: initialNewProjectDraft().ensemble[0]!.value,
    });
    const view = setup(draft);
    const removes = view.getAllByLabelText(/^Remove /);
    fireEvent.press(removes[1]!);
    expect(latest.ensemble.map(e => e.id)).toEqual([draft.ensemble[0]!.id]);
  });
});
