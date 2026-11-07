/**
 * Which tracks are drawn, from the inspector's Track tab.
 *
 * The only control in the app that hides a track, so what is pinned is that
 * it hides one, brings one back, and cannot hide them all.
 */
import {
  addBlankTrack,
  selectVisibleTrackIds,
} from '@sudobility/music_editing';
import { act, fireEvent } from '@testing-library/react-native';
import { renderWithApp, testDocument } from '@/test/render';
import { VisibleTracksField } from '@sudobility/music_ui_rn';

function setup(extraTracks = 1) {
  const document = testDocument();
  act(() => {
    for (let i = 0; i < extraTracks; i += 1) addBlankTrack(document.store);
  });
  const view = renderWithApp(<VisibleTracksField document={document} />);
  const ids = document.store.getState().score!.tracks.map(track => track.id);
  const shown = () => selectVisibleTrackIds(document.store.getState());
  return { view, document, ids, shown };
}

describe('VisibleTracksField', () => {
  it('lists every track, switched on', () => {
    const { view, ids } = setup(1);
    const switches = view.getAllByRole('switch');
    expect(switches).toHaveLength(ids.length);
    for (const item of switches) expect(item.props.value).toBe(true);
  });

  it('is not offered with a single track', () => {
    // Nothing that could be hidden — the web's rule, rather than a control
    // that can only ever be a no-op.
    const { view } = setup(0);
    expect(view.queryAllByRole('switch')).toHaveLength(0);
    expect(view.queryByText('Visible tracks')).toBeNull();
  });

  it('hides a track, and brings it back', () => {
    const { view, ids, shown } = setup(1);
    fireEvent(view.getAllByRole('switch')[1]!, 'valueChange', false);
    expect(shown()).toEqual([ids[0]]);
    fireEvent(view.getAllByRole('switch')[1]!, 'valueChange', true);
    expect(shown()).toEqual(ids);
  });

  it('keeps the list in score order, whatever order it was switched in', () => {
    const { view, ids, shown } = setup(2);
    fireEvent(view.getAllByRole('switch')[0]!, 'valueChange', false);
    fireEvent(view.getAllByRole('switch')[2]!, 'valueChange', false);
    fireEvent(view.getAllByRole('switch')[2]!, 'valueChange', true);
    fireEvent(view.getAllByRole('switch')[0]!, 'valueChange', true);
    expect(shown()).toEqual(ids);
  });

  it('will not hide the last track showing', () => {
    const { view, ids, shown } = setup(1);
    fireEvent(view.getAllByRole('switch')[1]!, 'valueChange', false);
    const last = view.getAllByRole('switch')[0]!;
    expect(last.props.disabled).toBe(true);
    // And refuses even if something gets past the control.
    fireEvent(last, 'valueChange', false);
    expect(shown()).toEqual([ids[0]]);
  });
});
