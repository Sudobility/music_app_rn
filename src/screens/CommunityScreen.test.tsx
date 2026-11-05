/**
 * The community list: the web page's states and titles, from music_types.
 *
 * `communityListState` and `communityItemTitle` are tested upstream; what this
 * pins is that the screen reads them — a blank public title printed an empty
 * row here (`publicName || name` treats spaces as a title), and a failed load
 * was told apart from an empty community only by which string happened to be
 * set.
 */
import { jest } from '@jest/globals';
import { ActivityIndicator, ScrollView, StyleSheet } from 'react-native';
import { act, fireEvent } from '@testing-library/react-native';
import type { CommunityItem } from '@sudobility/music_types';
import { renderWithApp } from '@/test/render';
import { CommunityScreen } from './CommunityScreen';

const mockListCommunity = jest.fn<() => Promise<CommunityItem[]>>();

// One client, as the real `getMusicClient` caches one: a fresh object per call
// would re-run the screen's load effect on every render.
jest.mock('@/config/server', () => {
  const client = {
    listCommunity: () => mockListCommunity(),
    avatarUrl: (avatarId: string) =>
      `https://api.test/public/avatars/${avatarId}`,
  };
  return { getMusicClient: () => client };
});
// The app's navigator is a prop, not a hook: the screen's bar is a navigator
// of its own, and mocking the hook would take that one's header with it.
// `addListener` captures the screen's `focus` subscriptions so a test can fire
// one — the list refetches on focus, which is how a just-published snapshot
// reaches a tab that never unmounts.
let focusListeners: Array<() => void> = [];
const navigation = {
  navigate: jest.fn(),
  addListener: (_type: 'focus', callback: () => void) => {
    focusListeners.push(callback);
    return () => {
      focusListeners = focusListeners.filter(listener => listener !== callback);
    };
  },
} as never;

function item(patch: Partial<CommunityItem>): CommunityItem {
  return {
    publicId: 'p1',
    name: 'Snapshot name',
    publicName: 'Public title',
    publisherName: 'Ada',
    publisherAvatarId: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    ...patch,
  } as CommunityItem;
}

async function render() {
  const view = renderWithApp(<CommunityScreen navigation={navigation} />);
  await act(async () => {});
  return view;
}

describe('CommunityScreen', () => {
  beforeEach(() => {
    // Call counts and focus subscriptions are asserted below, and this suite
    // has no auto-clear: each test sets its own resolved value, so a reset
    // costs nothing and keeps the counts honest.
    mockListCommunity.mockReset();
    focusListeners = [];
  });

  it('holds its content to the width of a page, centred', async () => {
    mockListCommunity.mockResolvedValue([item({})]);
    const view = await render();
    const page = view.UNSAFE_getByType(ScrollView);
    expect(StyleSheet.flatten(page.props.contentContainerStyle)).toMatchObject({
      width: '100%',
      maxWidth: 1280,
      alignSelf: 'center',
    });
  });

  it('titles a row with no public title by its name, not an empty line', async () => {
    mockListCommunity.mockResolvedValue([item({ publicName: '   ' })]);
    const view = await render();
    expect(view.getByText('Snapshot name')).toBeTruthy();
  });

  it('heads a tile with who shared it, and their initial for want of a picture', async () => {
    mockListCommunity.mockResolvedValue([item({})]);
    const view = await render();
    expect(view.getByText('Ada')).toBeTruthy();
    // Hidden from a screen reader, so from a query that reads as one does.
    expect(view.getByText('A', { includeHiddenElements: true })).toBeTruthy();
    expect(
      view.queryByTestId('publisher-picture', { includeHiddenElements: true }),
    ).toBeNull();
    expect(view.getByLabelText('Public title, by Ada')).toBeTruthy();
  });

  it('shows their picture when they have one', async () => {
    mockListCommunity.mockResolvedValue([item({ publisherAvatarId: 'av_1' })]);
    const view = await render();
    expect(
      view.getByTestId('publisher-picture', { includeHiddenElements: true })
        .props.source,
    ).toEqual({
      uri: 'https://api.test/public/avatars/av_1',
    });
  });

  it('offers nothing to do to a shared score but open it', async () => {
    // It is somebody else's: no Duplicate and no Delete, which the project
    // tiles this one is drawn like both have.
    mockListCommunity.mockResolvedValue([item({})]);
    const view = await render();
    expect(view.queryByLabelText(/duplicate/i)).toBeNull();
    expect(view.queryByLabelText(/delete/i)).toBeNull();
  });

  it('says a search matched nothing, rather than that nothing exists', async () => {
    mockListCommunity.mockResolvedValue([item({})]);
    const view = await render();
    fireEvent.changeText(view.getByLabelText(/search/i), 'zzzz');
    expect(view.queryByText('Public title')).toBeNull();
    expect(view.getByText(/zzzz/)).toBeTruthy();
  });

  it('loads inside the scroller it will show the tiles in', async () => {
    // React Native Windows did not paint this screen when its scroller was
    // swapped for another — a spinner screen for the list — and left it
    // blank until the next input. One scroller holds every state.
    mockListCommunity.mockReturnValue(new Promise(() => {}));
    const view = await render();
    const page = view.UNSAFE_getByType(ScrollView);
    expect(page.findByType(ActivityIndicator)).toBeTruthy();
    expect(page.findByProps({ testID: 'community-tiles' })).toBeTruthy();
  });

  it('reports a failed load as a failure', async () => {
    mockListCommunity.mockRejectedValue(new Error('offline'));
    const view = await render();
    expect(view.queryByText('offline')).toBeNull();
    expect(view.getByText(/could not|couldn't|failed/i)).toBeTruthy();
  });

  it('refetches on focus, so a snapshot published elsewhere appears', async () => {
    // The bug: this tab never unmounts, so a mount-only load never saw a
    // snapshot published after the first visit — the reader had to relaunch.
    mockListCommunity.mockResolvedValue([
      item({ publicId: 'p1', publicName: 'First' }),
    ]);
    const view = await render();
    expect(view.getByText('First')).toBeTruthy();
    expect(mockListCommunity).toHaveBeenCalledTimes(1);

    // A snapshot is published elsewhere; the tab is returned to.
    mockListCommunity.mockResolvedValue([
      item({ publicId: 'p1', publicName: 'First' }),
      item({ publicId: 'p2', publicName: 'Just published' }),
    ]);
    await act(async () => {
      focusListeners.forEach(listener => listener());
    });
    expect(mockListCommunity).toHaveBeenCalledTimes(2);
    expect(view.getByText('Just published')).toBeTruthy();
  });
});
