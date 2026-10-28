/**
 * The projects as a grid of tiles, with what can be done to each.
 */
import { jest } from '@jest/globals';
import { act, fireEvent } from '@testing-library/react-native';
import type { ProjectSummary } from '@sudobility/music_types';
import type { MusicHookContext } from '@sudobility/music_client';
import { renderWithApp } from '@/test/render';

const mockDuplicate = jest.fn<(input: { id: string }) => Promise<unknown>>();
const mockDelete = jest.fn<(id: string) => Promise<unknown>>();
jest.mock('@sudobility/music_client', () => ({
  useDuplicateProject: () => ({ mutateAsync: mockDuplicate, isPending: false }),
  useDeleteProject: () => ({ mutateAsync: mockDelete, isPending: false }),
}));
const mockFindOpen = jest.fn<(origin: unknown) => { id: string } | null>();
const mockClose = jest.fn<(id: string) => void>();
jest.mock('@/documents/DocumentsContext', () => ({
  useDocumentList: () => ({ findOpen: mockFindOpen, close: mockClose }),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { ProjectTiles, TILE_GAP, TILE_MIN_WIDTH, tileGrid } =
  require('./ProjectTiles') as typeof import('./ProjectTiles');

const project = (id: string, name: string): ProjectSummary =>
  ({
    id,
    name,
    status: 'ready',
    updatedAt: '2026-09-29T10:00:00.000Z',
  }) as unknown as ProjectSummary;

const PROJECTS = [project('a', 'Morning Song'), project('b', 'Evening Song')];
const context = {} as MusicHookContext;

function setup(onOpen = jest.fn()) {
  const view = renderWithApp(
    <ProjectTiles projects={PROJECTS} context={context} onOpen={onOpen} />,
  );
  return { view, onOpen };
}

beforeEach(() => {
  mockDuplicate.mockReset().mockResolvedValue({});
  mockDelete.mockReset().mockResolvedValue({});
  mockFindOpen.mockReset().mockReturnValue(null);
  mockClose.mockReset();
});

describe('the grid', () => {
  it('has one column until it has been measured', () => {
    expect(tileGrid(0).columns).toBe(1);
  });

  it('fits as many tiles as the width holds, all the same width', () => {
    // A tablet's detail pane beside a 320-point list.
    const { columns, tileWidth } = tileGrid(860);
    expect(columns).toBe(3);
    expect(tileWidth).toBeGreaterThanOrEqual(TILE_MIN_WIDTH);
    expect(columns * tileWidth + (columns + 1) * TILE_GAP).toBeLessThanOrEqual(
      860,
    );
  });

  it('is a single column on a width that holds one tile', () => {
    expect(tileGrid(TILE_MIN_WIDTH + 2 * TILE_GAP).columns).toBe(1);
    expect(tileGrid(2 * TILE_MIN_WIDTH + 3 * TILE_GAP).columns).toBe(2);
  });

  it('lays the tiles out across the width it is given', () => {
    const { view } = setup();
    // Unmeasured: one column, each tile as wide as the pane.
    for (const tile of view.getAllByTestId('project-tile')) {
      expect(tile.props.style).toBeUndefined();
    }
    fireEvent(view.getByTestId('project-tiles'), 'layout', {
      nativeEvent: { layout: { width: 860, height: 600 } },
    });
    const tiles = view.getAllByTestId('project-tile');
    expect(tiles).toHaveLength(PROJECTS.length);
    for (const tile of tiles) {
      expect(tile.props.style).toEqual({ width: tileGrid(860).tileWidth });
    }
  });
});

describe('a project tile', () => {
  it('opens the project when it is pressed', () => {
    const { view, onOpen } = setup();
    fireEvent.press(view.getByLabelText('Morning Song'));
    expect(onOpen).toHaveBeenCalledWith('a');
  });

  it('duplicates without opening', async () => {
    const { view, onOpen } = setup();
    await act(async () => {
      fireEvent.press(view.getByLabelText('Duplicate project: Morning Song'));
    });
    expect(mockDuplicate).toHaveBeenCalledWith({ id: 'a' });
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('spins on the Duplicate pressed until the copy exists, and copies once', async () => {
    let release: (value: unknown) => void = () => {};
    mockDuplicate.mockReturnValue(
      new Promise(resolve => {
        release = resolve;
      }),
    );
    const { view } = setup();
    const duplicate = () =>
      view.getByLabelText('Duplicate project: Morning Song');
    await act(async () => {
      fireEvent.press(duplicate());
    });
    expect(duplicate().props.accessibilityState).toMatchObject({
      disabled: true,
    });
    // No other tile starts a copy meanwhile either.
    expect(
      view.getByLabelText('Duplicate project: Evening Song').props
        .accessibilityState,
    ).toMatchObject({ disabled: true });
    await act(async () => {
      fireEvent.press(duplicate());
    });
    expect(mockDuplicate).toHaveBeenCalledTimes(1);
    await act(async () => {
      release({});
    });
    expect(duplicate().props.accessibilityState).toMatchObject({
      disabled: false,
    });
  });

  it('keeps the question up, its Delete spinning, until the server answers', async () => {
    let release: (value: unknown) => void = () => {};
    mockDelete.mockReturnValue(
      new Promise(resolve => {
        release = resolve;
      }),
    );
    const { view } = setup();
    fireEvent.press(view.getByLabelText('Delete project: Evening Song'));
    const confirm = () =>
      view.getAllByRole('button', { name: 'Delete' }).at(-1)!;
    await act(async () => {
      fireEvent.press(confirm());
    });
    // Still asking — and nothing on the sheet answers while it waits.
    expect(
      view.getByText('Delete "Evening Song"? This cannot be undone.'),
    ).toBeTruthy();
    expect(confirm().props.accessibilityState).toMatchObject({
      disabled: true,
    });
    fireEvent.press(view.getByText('Cancel'));
    await act(async () => {
      fireEvent.press(confirm());
    });
    expect(mockDelete).toHaveBeenCalledTimes(1);
    expect(
      view.getByText('Delete "Evening Song"? This cannot be undone.'),
    ).toBeTruthy();
    await act(async () => {
      release({});
    });
    expect(
      view.queryByText('Delete "Evening Song"? This cannot be undone.'),
    ).toBeNull();
  });

  it('asks before deleting, and deletes nothing if the answer is no', () => {
    const { view } = setup();
    fireEvent.press(view.getByLabelText('Delete project: Evening Song'));
    expect(
      view.getByText('Delete "Evening Song"? This cannot be undone.'),
    ).toBeTruthy();
    fireEvent.press(view.getByText('Cancel'));
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('deletes on a yes, and closes the project if it was open', async () => {
    mockFindOpen.mockReturnValue({ id: 'doc-7' });
    const { view, onOpen } = setup();
    fireEvent.press(view.getByLabelText('Delete project: Evening Song'));
    const dialog = view.getByText(
      'Delete "Evening Song"? This cannot be undone.',
    );
    expect(dialog).toBeTruthy();
    await act(async () => {
      fireEvent.press(view.getAllByText('Delete').at(-1)!);
    });
    expect(mockDelete).toHaveBeenCalledWith('b');
    expect(mockFindOpen).toHaveBeenCalledWith({
      kind: 'project',
      projectId: 'b',
    });
    expect(mockClose).toHaveBeenCalledWith('doc-7');
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('says so when a project could not be deleted, and closes nothing', async () => {
    mockDelete.mockRejectedValue(new Error('nope'));
    mockFindOpen.mockReturnValue({ id: 'doc-7' });
    const { view } = setup();
    fireEvent.press(view.getByLabelText('Delete project: Morning Song'));
    await act(async () => {
      fireEvent.press(view.getAllByText('Delete').at(-1)!);
    });
    expect(view.getByText('Failed to delete project')).toBeTruthy();
    expect(mockClose).not.toHaveBeenCalled();
  });
});
