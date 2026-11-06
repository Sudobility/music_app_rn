/**
 * The Projects split view, as master and detail.
 *
 * What is pinned here is that the reader stays on the pane they drilled into
 * across a rotation that collapses the split and opens it again — the
 * `detailFocused` wiring. The panes themselves talk to the server and the
 * document store; they are stood in for, so the detail is a plain marker this
 * test can see. The sidebar (the master list) is the real one, since it is
 * what a row press drills in from.
 */
import { jest } from '@jest/globals';
import i18next from 'i18next';
import { fireEvent } from '@testing-library/react-native';
import { DocumentList } from '@/documents/document-list';
import { DocumentsProvider } from '@/documents/DocumentsContext';
import { renderWithApp } from '@/test/render';

const mockUser = jest.fn<() => unknown>();

jest.mock('@/auth/AuthContext', () => ({
  useAuth: () => ({
    user: mockUser(),
    signOut: async () => {},
    getToken: async () => null,
  }),
}));
jest.mock('@/config/useServerContext', () => ({
  useServerContext: () => null,
  publicServerContext: () => ({ token: null }),
}));
jest.mock('@/features/projects/useServerProjectCreation', () => ({
  useServerProjectCreation: () => ({ account: {}, create: async () => null }),
  ServerProjectCreationFeedback: () => null,
}));
jest.mock('@/features/documents/useSingleDocumentGuard', () => ({
  useSingleDocumentGuard: () => ({
    guard: (run: () => void) => run(),
    prompt: null,
  }),
}));

function mockPane(name: string) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Text } = require('react-native') as typeof import('react-native');
  return () => <Text>{name}</Text>;
}
jest.mock('./MyProjectsPane', () => ({
  MyProjectsPane: mockPane('my-projects pane'),
}));
jest.mock('./NewPane', () => ({ NewPane: mockPane('new pane') }));
jest.mock('./TemplatePane', () => ({
  TemplatePane: mockPane('template pane'),
}));
jest.mock('./ImportPane', () => ({ ImportPane: mockPane('import pane') }));
jest.mock('./OpenDocumentsPane', () => ({
  OpenDocumentsPane: mockPane('open pane'),
}));
jest.mock('@/features/account/SignInPage', () => ({
  SignInPage: mockPane('sign-in page'),
}));

const { ProjectsSplitView } =
  require('./ProjectsSplitView') as typeof import('./ProjectsSplitView');

/** The visible string for a key; i18n is started by the first render. */
const label = (key: string): string => i18next.t(key);

function setup() {
  return renderWithApp(
    <DocumentsProvider list={new DocumentList()}>
      <ProjectsSplitView
        collapsible
        onProjectOpened={() => {}}
        onOpenCredits={() => {}}
      />
    </DocumentsProvider>,
  );
}

const layoutOf = (view: ReturnType<typeof setup>) => (width: number) =>
  fireEvent(view.getByTestId('master-detail'), 'layout', {
    nativeEvent: { layout: { width, height: 800, x: 0, y: 0 } },
  });

beforeEach(() => {
  // Signed out, so the list opens on New — a local start that needs no server.
  mockUser.mockReturnValue(null);
});

describe('ProjectsSplitView, collapsed', () => {
  it('stays on the open pane after a rotation collapses the split, once drilled in', () => {
    const view = setup();
    const layout = layoutOf(view);
    // One column (a phone in portrait): the sidebar, the pane not beside it.
    layout(390);
    expect(view.queryByText('template pane')).toBeNull();
    // Drill into a pane: it is pushed over the sidebar.
    fireEvent.press(view.getByText(label('dashboard.newFromTemplateAction')));
    expect(view.getByText('template pane')).toBeTruthy();
    // Rotate to landscape (two columns) and back to portrait (one): still on
    // the pane, not dropped back to the sidebar.
    layout(900);
    layout(390);
    expect(view.getByText('template pane')).toBeTruthy();
  });

  it('stays on the sidebar across a rotation when nothing was drilled into', () => {
    // The mirror: without a drill-in, a collapse reopens on the sidebar, so the
    // default New pane is not rendered over it.
    const view = setup();
    const layout = layoutOf(view);
    layout(390);
    layout(900);
    layout(390);
    expect(view.queryByText('new pane')).toBeNull();
  });
});
