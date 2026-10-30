/**
 * What the projects screen offers when there is no account behind it.
 *
 * The project list needs a server and a sign-in; **importing a file does not**,
 * and putting the two behind one gate is what made a signed-out install unable
 * to open anything at all. MIDI, MusicXML and a tracker module are decoded on
 * the device and become a local document, and this app has no auth gate over
 * the editor precisely because a local document needs no account — so the
 * Import control has to survive both empty states. Audio is the exception and
 * is allowed to say it cannot run, because it is transcribed server-side.
 */
import { jest } from '@jest/globals';
import { fireEvent } from '@testing-library/react-native';
import { DocumentList } from '@/documents/document-list';
import { DocumentsProvider } from '@/documents/DocumentsContext';
import { renderWithApp } from '@/test/render';

const mockUser = jest.fn<() => unknown>();
const mockServerContext = jest.fn<() => unknown>();

jest.mock('@/auth/AuthContext', () => ({
  useAuth: () => ({ user: mockUser(), getToken: async () => 'tok' }),
}));
jest.mock('@/config/useServerContext', () => ({
  useServerContext: () => mockServerContext(),
}));
jest.mock('@react-navigation/native', () => ({
  // Keep the real exports — the split view's own navigators and, through the
  // tab navigator, `createScreenFactory` need them — and stand in only for the
  // hook this screen reads.
  ...(jest.requireActual('@react-navigation/native') as object),
  useNavigation: () => ({ navigate: jest.fn() }),
}));
/*
  The picker and the decoder, stubbed for the same reason `ImportButtons`'
  own test stubs them: neither exists off a device, and what is under test
  here is whether the control is *reachable*, not what it reads.
*/
jest.mock('@/documents/file-picker', () => ({
  createFilePicker: () => ({
    isSupported: () => true,
    pickFile: async () => null,
    pickSaveLocation: async () => null,
  }),
}));
jest.mock('@/documents/import', () => ({
  IMPORT_EXTENSIONS: { midi: ['mid'], musicxml: ['xml'], tracker: ['xm'] },
  importDocument: async () => ({ warnings: [] }),
}));
jest.mock('@/documents/rn-storage', () => ({
  createImportSource: () => ({
    readText: async () => '',
    readBytes: async () => new ArrayBuffer(0),
  }),
}));
/*
  The credit balance reaches `@sudobility/consumables_client`, which is built
  with extensionless relative imports that Node's ESM loader refuses — the same
  reason the web app inlines it for vitest. Nothing here spends a credit, so
  the hook is stubbed rather than the package taught to load.
*/
jest.mock('@/features/credits/useCreditBalance', () => ({
  useCreditBalance: () => ({ balance: null, refresh: () => undefined }),
}));

const { DashboardScreen } =
  require('./DashboardScreen') as typeof import('./DashboardScreen');

function setup() {
  return renderWithApp(
    <DocumentsProvider list={new DocumentList()}>
      <DashboardScreen />
    </DocumentsProvider>,
  );
}

beforeEach(() => {
  mockUser.mockReset();
  mockServerContext.mockReset();
});

describe('DashboardScreen', () => {
  it('offers Import with no account', () => {
    mockServerContext.mockReturnValue({ client: {}, getToken: async () => '' });
    mockUser.mockReturnValue(null);
    const view = setup();
    // Arriving signed out opens the sign-in modal; closing it leaves the gate,
    // since the list genuinely needs an account.
    expect(view.getByTestId('login-view')).toBeTruthy();
    fireEvent.press(view.getByRole('button', { name: 'Close' }));
    expect(view.queryByTestId('login-view')).toBeNull();
    expect(view.getByRole('button', { name: 'Sign in' })).toBeTruthy();
    // And so is the half that does not.
    fireEvent.press(view.getByLabelText('Import a file'));
    expect(view.getByText('Import MIDI')).toBeTruthy();
  });

  it('offers Import with no server at all', () => {
    /*
      A local-only build is a supported state, not a broken one: the formats
      that decode on the device are exactly the ones still available in it.
    */
    mockServerContext.mockReturnValue(null);
    mockUser.mockReturnValue(null);
    const view = setup();
    expect(view.getByText(/server/i)).toBeTruthy();
    fireEvent.press(view.getByLabelText('Import a file'));
    expect(view.getByText('Import MusicXML')).toBeTruthy();
  });
});
