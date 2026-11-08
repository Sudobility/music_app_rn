/**
 * The title bar.
 *
 * Its rule is that a control is **absent rather than dead** when it cannot
 * work: Snapshots and Print each depend on something the document may not have
 * — a project row, or a print service — and a button that is present and
 * refuses invites a tap that can only fail. There is no Generate at all: an
 * open project offers Generate Again on the Score tab, as the web does.
 */
import { jest } from '@jest/globals';
import { act, fireEvent } from '@testing-library/react-native';
import { renderWithApp, testDocument } from '@/test/render';
import { TitleBar } from '@sudobility/music_ui_rn';
import type { MusicNavigator } from '@sudobility/music_lib';

function setup(overrides: Partial<Parameters<typeof TitleBar>[0]> = {}) {
  const document = testDocument({ title: 'Quartet' });
  const onSave = jest.fn();
  const onExport = jest.fn();
  // Projects and Settings now navigate through the shared navigator rather
  // than through app callbacks, so a spy navigator is how those are asserted.
  const go = jest.fn();
  const navigator: MusicNavigator = {
    go: go as MusicNavigator['go'],
    replace: () => {},
    back: () => {},
    current: () => null,
  };
  const view = renderWithApp(
    <TitleBar
      document={document}
      onSave={onSave}
      onExport={onExport}
      {...overrides}
    />,
    { navigator },
  );
  return { view, document, onSave, onExport, go };
}

describe('TitleBar', () => {
  it('shows the document name', () => {
    expect(setup().view.getByText('Quartet')).toBeTruthy();
  });

  it('offers no Generate: a new score is where a project starts', () => {
    expect(
      setup({ onSnapshots: jest.fn() }).view.queryByLabelText(/generate/i),
    ).toBeNull();
  });

  it("shows the store's save state, including an autosave in flight", () => {
    const { view, document } = setup();
    expect(view.getByText('Saved')).toBeTruthy();
    act(() => {
      document.store.setState(state => {
        state.saveState = 'saving';
      });
    });
    expect(view.getByText('Saving…')).toBeTruthy();
  });

  it('always offers Settings, because it is the only way to that screen', () => {
    /*
      Unlike Snapshots and Print this has no prerequisite and no alternative
      route: theme, language, sign-in and the links to Docs, Shortcuts,
      Resources, About and Credits are all behind it, and the Mac's own
      "Settings…" item is the generated template item that answers to nothing.
      Nothing navigated there at all before this button existed.
    */
    const { view, go } = setup();
    fireEvent.press(view.getByLabelText('Settings'));
    expect(go).toHaveBeenCalledWith('settings');
  });

  it('always offers Projects, because it is the only way to that screen', () => {
    /*
      Same shape as Settings, and the same reason: the projects list carries
      New Project and every import, and *nothing* in the app navigated to it —
      `screens-reachable.test.ts` is what found that. The Mac reaches the same
      things from the File menu; iOS and Android have no menu bar, so without
      this button the only document a phone could ever open was the scratch one
      made at launch.
    */
    const { view, go } = setup();
    fireEvent.press(view.getByLabelText('Projects'));
    expect(go).toHaveBeenCalledWith('projects');
  });

  it('omits Snapshots for the same reason', () => {
    expect(setup().view.queryByLabelText(/snapshot/i)).toBeNull();
  });

  it('omits Print on a build with no print service', () => {
    expect(setup().view.queryByLabelText(/print/i)).toBeNull();
  });

  it('offers each one when its prerequisite is there', () => {
    const onSnapshots = jest.fn();
    const onPrint = jest.fn();
    const { view } = setup({ onSnapshots, onPrint });
    fireEvent.press(view.getByLabelText(/snapshot/i));
    fireEvent.press(view.getByLabelText(/print/i));
    expect(onSnapshots).toHaveBeenCalled();
    expect(onPrint).toHaveBeenCalled();
  });

  it('disables undo with no history rather than hiding it', () => {
    /*
      Unlike the three above, undo is always *applicable* — it is just empty.
      A disabled control says "there is nothing to undo"; an absent one says
      "this app cannot undo", which is a different and wrong claim.
    */
    const { view } = setup();
    expect(view.getByLabelText(/undo/i).props.accessibilityState.disabled).toBe(
      true,
    );
  });
});
