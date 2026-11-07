/**
 * The long-press menu — where cut, copy, paste, clear and delete live now.
 *
 * Two things here are the whole reason it is a menu rather than four buttons on
 * the editing bar. It **names its subject**, because Delete means three
 * different edits depending on whether a track, a span of bars or a run of notes
 * is selected. And it offers **Clear beside Delete**, which the bar never did
 * because the action did not exist: a cleared bar keeps its number and its
 * markings, a deleted one takes the rest of the score up with it.
 *
 * The rules — which entries are live, what the header counts — are
 * music_editing's `scoreContextMenuModel`, tested there. These render the
 * model, so what is pinned here is that the sheet draws what it is handed; the
 * web app's `ScoreContextMenu.test.tsx` asserts the same about its menu.
 */
import { jest } from '@jest/globals';
import { fireEvent } from '@testing-library/react-native';
import { scoreContextMenuModel } from '@sudobility/music_editing';
import type { ScoreSelection } from '@sudobility/music_types';
import { renderWithApp } from '@/test/render';
import { ScoreActionsSheet } from '@sudobility/music_ui_rn';
import type { ClipboardData } from '@sudobility/music_types';

const ids = (prefix: string, n: number) =>
  Array.from({ length: n }, (_, i) => `${prefix}${i}`);
const noteSelection = (n: number): ScoreSelection => ({
  eventIds: ids('n', n),
  measureIds: [],
  trackIds: [],
});
const selections: Record<string, (n: number) => ScoreSelection> = {
  track: () => ({ eventIds: [], measureIds: [], trackIds: ['t0'] }),
  measures: n => ({ eventIds: [], measureIds: ids('m', n), trackIds: [] }),
  notes: noteSelection,
};
const NOTES_CLIPBOARD: ClipboardData = {
  kind: 'notes',
  events: [],
  anchorTick: 0,
};
const NOTHING: ScoreSelection = { eventIds: [], measureIds: [], trackIds: [] };

function open(
  input: {
    selection?: ScoreSelection;
    clipboard?: ClipboardData | null;
    playing?: boolean;
  } = {},
) {
  const onAction = jest.fn();
  const onClose = jest.fn();
  const view = renderWithApp(
    <ScoreActionsSheet
      open
      model={scoreContextMenuModel({
        selection: input.selection ?? noteSelection(1),
        clipboard: input.clipboard ?? null,
        playing: input.playing ?? false,
      })}
      onAction={onAction}
      onClose={onClose}
    />,
  );
  return { view, onAction, onClose };
}

const disabled = (view: ReturnType<typeof open>['view'], name: RegExp) =>
  view.getByLabelText(name).props.accessibilityState.disabled === true;

describe('the subject header', () => {
  it.each([
    ['track', 1, 'Track'],
    ['measures', 1, 'Bar'],
    ['measures', 4, 'Bars'],
    ['notes', 1, 'Note'],
    ['notes', 3, 'Notes'],
  ])('names %s (%i) as "%s"', (kind, count, label) => {
    const { view } = open({ selection: selections[kind]!(count) });
    expect(view.getByText(label)).toBeTruthy();
  });

  it('says nothing when nothing is selected', () => {
    const { view } = open({ selection: NOTHING });
    expect(view.queryByText('Track')).toBeNull();
    expect(view.queryByText('Notes')).toBeNull();
  });
});

describe('the entries', () => {
  it('offers Clear and Delete as separate choices', () => {
    const { view } = open();
    expect(disabled(view, /^clear$/i)).toBe(false);
    expect(disabled(view, /delete selection/i)).toBe(false);
  });

  it('reports which one was chosen, and closes', () => {
    const { view, onAction, onClose } = open();
    fireEvent.press(view.getByLabelText(/^clear$/i));
    expect(onAction).toHaveBeenCalledWith('clear');
    // Closed, so a second choice cannot be made against a stale selection.
    expect(onClose).toHaveBeenCalled();
  });

  it('disables everything that acts on a selection when there is none', () => {
    const { view } = open({ selection: NOTHING });
    for (const name of [/^copy$/i, /^cut$/i, /^clear$/i, /delete selection/i])
      expect(disabled(view, name)).toBe(true);
    // Select all needs no selection, by definition.
    expect(disabled(view, /select all/i)).toBe(false);
  });

  it('keeps Copy live while the transport plays, and nothing else', () => {
    // Copy only reads. The same exemption the edit lock makes everywhere else.
    const { view } = open({ playing: true });
    expect(disabled(view, /^copy$/i)).toBe(false);
    for (const name of [/^cut$/i, /^clear$/i, /delete selection/i])
      expect(disabled(view, name)).toBe(true);
  });

  it('offers Paste only when the clipboard holds the same kind of thing', () => {
    expect(disabled(open().view, /^paste$/i)).toBe(true);
    expect(
      disabled(open({ clipboard: NOTES_CLIPBOARD }).view, /^paste$/i),
    ).toBe(false);
  });
});
