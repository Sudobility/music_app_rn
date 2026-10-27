/**
 * What the panel does with `useProjectSnapshots`.
 *
 * The rules themselves — flush before creating, no re-download, the stamp
 * noted — are music_client's and tested there. What fails silently *here* is
 * the wiring between a sheet and the hook: **publishing happens in the same
 * step as creating**, because that is how the sheet asks it, and a create that
 * quietly skipped the publish would leave the reader believing their music was
 * public when it was not. Nor must a snapshot that was not asked to be public
 * become so.
 */
import { jest } from '@jest/globals';
import { act, fireEvent } from '@testing-library/react-native';
import type { ProjectSnapshots } from '@sudobility/music_client';
import { renderWithApp } from '@/test/render';
import { SnapshotsPanel } from './SnapshotsPanel';

function fakeSnapshots(
  overrides: Partial<ProjectSnapshots> = {},
): ProjectSnapshots {
  return {
    snapshots: [],
    nodes: [],
    parentSnapshotId: null,
    published: [],
    defaultPublisherName: undefined,
    isLoading: false,
    error: null,
    refresh: jest.fn(async () => {}),
    create: jest.fn(async () => null),
    publish: jest.fn(async () => null),
    rename: jest.fn(async () => null),
    unpublish: jest.fn(async () => ({}) as never),
    open: jest.fn(async () => ({}) as never),
    ...overrides,
  } as ProjectSnapshots;
}

async function createFrom(view: ReturnType<typeof renderWithApp>) {
  fireEvent.press(view.getByText('New snapshot'));
  await act(async () => {
    // By role: the sheet's title says the same words as its confirm button.
    fireEvent.press(view.getByRole('button', { name: 'Create snapshot' }));
  });
}

describe('SnapshotsPanel', () => {
  it('creates a snapshot without publishing one that was not asked to be', async () => {
    const snapshots = fakeSnapshots();
    const view = renderWithApp(
      <SnapshotsPanel snapshots={snapshots} projectName="Quartet" />,
    );
    await createFrom(view);
    expect(snapshots.create).toHaveBeenCalledWith({ name: 'Version 1' });
  });

  it('publishes in the same step when the sheet asks it to', async () => {
    const snapshots = fakeSnapshots({ defaultPublisherName: 'A Composer' });
    const view = renderWithApp(
      <SnapshotsPanel snapshots={snapshots} projectName="Quartet" />,
    );
    fireEvent.press(view.getByText('New snapshot'));
    fireEvent(view.getByLabelText('Publish'), 'valueChange', true);
    fireEvent(view.getByLabelText(/full copyright/i), 'valueChange', true);
    await act(async () => {
      fireEvent.press(view.getByRole('button', { name: 'Create snapshot' }));
    });
    expect(snapshots.create).toHaveBeenCalledWith({
      name: 'Version 1',
      publish: { publisherName: 'A Composer', publicName: 'Quartet Version 1' },
    });
  });

  it('keeps the create form up, Create spinning, until the snapshot exists', async () => {
    let release: (value: null) => void = () => {};
    const snapshots = fakeSnapshots({
      create: jest.fn(
        () =>
          new Promise<null>(resolve => {
            release = resolve;
          }),
      ),
    });
    const view = renderWithApp(
      <SnapshotsPanel snapshots={snapshots} projectName="Quartet" />,
    );
    await createFrom(view);
    const create = () => view.getByRole('button', { name: 'Create snapshot' });
    expect(create().props.accessibilityState).toMatchObject({
      disabled: true,
    });
    // A second press is the same snapshot twice; it is refused.
    await act(async () => {
      fireEvent.press(create());
    });
    expect(snapshots.create).toHaveBeenCalledTimes(1);
    await act(async () => {
      release(null);
    });
    expect(view.queryByRole('button', { name: 'Create snapshot' })).toBeNull();
  });

  it('reports a failed write rather than swallowing it', async () => {
    const snapshots = fakeSnapshots({
      create: jest.fn(async () => {
        throw new Error('offline');
      }),
    });
    const view = renderWithApp(
      <SnapshotsPanel snapshots={snapshots} projectName="Quartet" />,
    );
    await createFrom(view);
    expect(view.getByText('offline')).toBeTruthy();
  });

  it('offers to withdraw what is already public', async () => {
    const published = {
      id: 's1',
      name: 'Version 1',
      publicId: 'pub1',
      publicName: 'Quartet Version 1',
      publisherName: 'A Composer',
    } as never;
    const snapshots = fakeSnapshots({
      snapshots: [published],
      published: [published],
    });
    const view = renderWithApp(
      <SnapshotsPanel snapshots={snapshots} projectName="Quartet" />,
    );
    await act(async () => {
      fireEvent.press(view.getByText('Unpublish'));
    });
    expect(snapshots.unpublish).toHaveBeenCalledWith('s1');
  });
});
