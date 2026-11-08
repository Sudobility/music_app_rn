/**
 * `nav.projects` and `nav.settings`, the two title-bar buttons a desktop
 * build now reaches through the File menu instead (`AppLayout`'s
 * `hasMenuBar()` gate). File.new/open/save are exercised by hand today, not
 * by this file — this is scoped to the two commands this change added.
 *
 * `useMenuCommand` is replaced with a fake that hands the test the handler
 * directly, rather than simulating a real native menu event: what is under
 * test is what a command *does*, which `menu-commands.ts` already covers on
 * its own account.
 */
import { jest } from '@jest/globals';
import { act } from '@testing-library/react-native';
import { StackActions } from '@react-navigation/native';
import { DocumentList } from '@/documents/document-list';
import { DocumentsProvider } from '@/documents/DocumentsContext';
import { MusicPosition } from '@sudobility/music_types';
import { renderWithApp } from '@/test/render';
import type { MenuCommand } from '@/app/menu-commands';

// `jest.mock`'s factory is hoisted above these declarations, so both mutable
// handles it closes over must carry the `mock` prefix Jest exempts from its
// no-out-of-scope-variable guard.
let mockHandler: ((command: MenuCommand) => void) | null = null;
const mockNavigate = jest.fn();
const mockDispatch = jest.fn();

jest.mock('@/app/menu-commands', () => ({
  ...(jest.requireActual('@/app/menu-commands') as object),
  useMenuCommand: (fn: (command: MenuCommand) => void) => {
    mockHandler = fn;
  },
}));

jest.mock('@/app/Navigation', () => ({
  navigationRef: {
    isReady: () => true,
    navigate: mockNavigate,
    dispatch: mockDispatch,
  },
}));

/*
  Signed out and server-less, the same way `useServerProjectCreation.test.tsx`
  stands these two in: `AuthContext` reaches `firebase/app`'s ESM at import
  time, which jest's CJS transform cannot parse, and nothing under test here
  needs a real account or client.
*/
jest.mock('@/auth/AuthContext', () => ({
  useAuth: () => ({
    user: null,
    siteAdmin: false,
    getToken: async () => null,
  }),
}));
jest.mock('@/config/server', () => ({
  getMusicClient: () => null,
  getNetworkClient: () => ({}),
  publicServerContext: () => null,
}));
jest.mock('@/features/credits/useCreditBalance', () => ({
  useCreditBalance: () => ({
    balance: null,
    loading: false,
    refresh: () => undefined,
  }),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { MenuFileCommands } =
  require('./MenuFileCommands') as typeof import('./MenuFileCommands');

function setup() {
  const list = new DocumentList({ position: () => new MusicPosition() });
  return renderWithApp(
    <DocumentsProvider list={list}>
      <MenuFileCommands />
    </DocumentsProvider>,
  );
}

describe('MenuFileCommands nav commands', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockDispatch.mockClear();
    mockHandler = null;
  });

  it('opens the projects list on nav.projects', () => {
    setup();
    act(() => mockHandler!('nav.projects'));
    // The test platform has a tab bar, so Projects is a tab: the tabs are
    // returned to with that one chosen. `tab-bar.test.tsx` holds both forms.
    expect(mockDispatch).toHaveBeenCalledWith(
      StackActions.popTo('Main', { screen: 'Dashboard', params: undefined }),
    );
  });

  it('opens Settings on nav.settings', () => {
    setup();
    act(() => mockHandler!('nav.settings'));
    expect(mockDispatch).toHaveBeenCalledWith(
      StackActions.popTo('Main', { screen: 'Settings', params: undefined }),
    );
  });

  it('opens Docs on nav.docs (Help ▸ Moosiac Help)', () => {
    setup();
    act(() => mockHandler!('nav.docs'));
    expect(mockDispatch).toHaveBeenCalledWith(
      StackActions.popTo('Main', { screen: 'Docs', params: undefined }),
    );
  });

  it('ignores every other command', () => {
    setup();
    act(() => mockHandler!('export.midi'));
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(mockDispatch).not.toHaveBeenCalled();
  });
});
