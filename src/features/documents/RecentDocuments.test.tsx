/**
 * The way back to something you were working on.
 *
 * Two rules. Reopening goes through `openFileInto`, so a file already open
 * raises its tab rather than opening a second, divergent copy. And **a file
 * that has gone away leaves the list** rather than sitting there failing every
 * time it is tapped — a recent list whose entries do not open is worse than an
 * empty one, because it looks like the app is broken rather than the file gone.
 */
import { jest } from '@jest/globals';
import { act, waitFor, fireEvent } from '@testing-library/react-native';
import { DocumentList } from '@/documents/document-list';
import { DocumentsProvider } from '@/documents/DocumentsContext';
import { renderWithApp } from '@/test/render';
import type { KeyValueStore } from '@/documents/recent-documents';
import { noteOpened } from '@/documents/recent-documents';
import { RecentDocuments } from './RecentDocuments';

function memoryStore(): KeyValueStore {
  const map = new Map<string, string>();
  return {
    getItem: async k => map.get(k) ?? null,
    setItem: async (k, v) => void map.set(k, v),
  };
}

const readText = jest.fn<() => Promise<string>>();

/** The document services, with a filesystem whose reads the test decides. */
function services() {
  return {
    context: {},
    files: {
      readText: () => readText(),
      writeText: async () => undefined,
    },
  };
}

describe('RecentDocuments', () => {
  it('shows nothing at all when there is no history', async () => {
    // An empty heading is a promise of content that is not there.
    const view = renderWithApp(
      <DocumentsProvider list={new DocumentList()} services={services()}>
        <RecentDocuments keyValue={memoryStore()} />
      </DocumentsProvider>,
    );
    await act(async () => {});
    // The `PortalHost` the harness mounts is always in the tree, so "drew
    // nothing" is a statement about what is inside it.
    expect(
      (view.toJSON() as { children?: unknown } | null)?.children,
    ).toBeNull();
  });

  it('lists what was opened before', async () => {
    const keyValue = memoryStore();
    /*
  `handle` and `openedAt` are required: the handle is what to reopen *with* —
  equal to the uri unless the platform needs a token, which sandboxed macOS
  does — and the timestamp is supplied by the caller, never read inside.
*/
    await noteOpened(keyValue, {
      uri: '/a.moosiac',
      title: 'Quartet',
      handle: '/a.moosiac',
      openedAt: 1,
    });
    const view = renderWithApp(
      <DocumentsProvider list={new DocumentList()} services={services()}>
        <RecentDocuments keyValue={keyValue} />
      </DocumentsProvider>,
    );
    await waitFor(() => expect(view.getByText('Quartet')).toBeTruthy());
  });

  it('forgets an entry whose file has gone', async () => {
    const keyValue = memoryStore();
    await noteOpened(keyValue, {
      uri: '/gone.moosiac',
      title: 'Gone',
      handle: '/gone.moosiac',
      openedAt: 1,
    });
    readText.mockRejectedValue(new Error('ENOENT'));
    const view = renderWithApp(
      <DocumentsProvider list={new DocumentList()} services={services()}>
        <RecentDocuments keyValue={keyValue} />
      </DocumentsProvider>,
    );
    await waitFor(() => expect(view.getByText('Gone')).toBeTruthy());
    await act(async () => {
      fireEvent.press(view.getByText('Gone'));
    });
    await waitFor(() => expect(view.queryByText('Gone')).toBeNull());
  });
});
