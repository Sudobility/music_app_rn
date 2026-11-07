/**
 * The property sheet's four tabs.
 *
 * The order and the opening tab are music_types' (`INSPECTOR_TABS`) and
 * music_editing's (`defaultInspectorTab`), shared with the web: Score, Track, Note, Bar — and a
 * fresh selection opens the tab it is *of*, Track when nothing is selected,
 * because the Note and Bar tabs are an empty state until something is. This
 * panel listed Track, Note, Bar, Score and always opened on Track, so a reader
 * moving between the apps found the tabs in a different place and tapped a note
 * to find its properties one tab away.
 *
 * The tabs are driven through the control rather than by pressing their labels.
 * `SegmentedTabs` is a real `UISegmentedControl` on iOS — which is the platform
 * jest simulates — and its labels are a `values` prop on a native view, not
 * `Text` a query can find or a `Pressable` a test can press.
 */
import { act, fireEvent } from '@testing-library/react-native';
import {
  defaultInsertPitch,
  insertNoteAtCaret,
} from '@sudobility/music_editing';
import { isNoteEvent } from '@sudobility/music_types';
import { renderWithApp, testDocument } from '@/test/render';
import { InspectorPanel } from '@sudobility/music_ui_rn';

/** Selects a tab the way a tap on that segment does. */
function selectTab(view: ReturnType<typeof renderWithApp>, index: number) {
  fireEvent(view.getByTestId('inspector-tabs'), 'change', {
    nativeEvent: { selectedSegmentIndex: index },
  });
}

describe('InspectorPanel', () => {
  it('opens on the track when nothing is selected', () => {
    const view = renderWithApp(<InspectorPanel document={testDocument()} />);
    /*
      The track tab's Name field, which exists for every score — by its
      accessible name, not by the word on the tab, which an empty panel would
      satisfy just as happily.
    */
    expect(view.getByLabelText('Name')).toBeTruthy();
    expect(view.getByTestId('inspector-tabs').props.selectedIndex).toBe(1);
  });

  it("offers the four tabs in the web's order", () => {
    // No Unplugged tab: the stage arrangement is the Spatial view now, a
    // toggle on the transport bar, as on the web.
    const view = renderWithApp(<InspectorPanel document={testDocument()} />);
    expect(view.getByTestId('inspector-tabs').props.values).toEqual([
      'Score',
      'Track',
      'Note',
      'Bar',
    ]);
  });

  it('opens the Note tab when a note is selected', () => {
    const document = testDocument();
    const view = renderWithApp(<InspectorPanel document={document} />);
    act(() => {
      insertNoteAtCaret(document.store, defaultInsertPitch(document.store));
      const note = document.store
        .getState()
        .score!.tracks[0].measures[0].voices[0].events.find(isNoteEvent)!;
      document.store
        .getState()
        .setSelection({ eventIds: [note.id], measureIds: [], trackIds: [] });
    });
    expect(view.getByTestId('inspector-tabs').props.selectedIndex).toBe(2);
    expect(view.getByLabelText('Velocity')).toBeTruthy();
  });

  it('shows an empty state rather than nothing when no note is selected', () => {
    /*
      A blank panel is indistinguishable from a broken one. The note tab says
      what to do instead — which is why `EmptyTab` exists rather than a null
      return.
    */
    const view = renderWithApp(<InspectorPanel document={testDocument()} />);
    selectTab(view, 2);
    expect(view.getByText(/select/i)).toBeTruthy();
  });
});
