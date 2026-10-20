/**
 * Settings, as master and detail.
 *
 * What is pinned is the list: what is on it, in what order, and for whom. The
 * sections behind the account's entries talk to a server and have their own
 * clients; they are stood in for here.
 */
import { jest } from '@jest/globals';
import { fireEvent } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { DocumentList } from '@/documents/document-list';
import { DocumentsProvider } from '@/documents/DocumentsContext';
import { renderWithApp } from '@/test/render';

const mockSetMode = jest.fn();
const mockUser = jest.fn<() => unknown>();
const mockAdmin = jest.fn<() => boolean>();

// Administrator status is its own hook, beside the shared auth context.
jest.mock('@/auth/useSiteAdmin', () => ({
  useSiteAdmin: () => mockAdmin(),
}));
jest.mock('@/auth/AuthContext', () => ({
  useAuth: () => ({
    user: mockUser(),
    signOut: async () => {},
    getToken: async () => null,
  }),
}));
jest.mock('@/config/ThemeContext', () => ({
  useTheme: () => ({ mode: 'system', resolved: 'light', setMode: mockSetMode }),
}));
// The credits pane reads a balance over the network; nothing here needs one.
jest.mock('@/config/server', () => ({
  getMusicClient: () => ({}),
  getNetworkClient: () => ({}),
}));
jest.mock('@/features/credits/useCreditBalance', () => ({
  useCreditBalance: () => ({
    balance: 12,
    loading: false,
    refresh: () => undefined,
  }),
}));

function mockSection(name: string) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Text } = require('react-native') as typeof import('react-native');
  return () => <Text>{name}</Text>;
}
jest.mock('./settings/AccountSection', () => ({
  AccountSection: mockSection('account section'),
}));
jest.mock('./settings/CreditHistorySection', () => ({
  CreditHistorySection: mockSection('history section'),
}));
jest.mock('./settings/RedeemCouponForm', () => ({
  RedeemCouponForm: mockSection('coupon form'),
}));
jest.mock('./settings/ApiKeysSection', () => ({
  ApiKeysSection: mockSection('api keys section'),
}));
jest.mock('./settings/ManageCouponsSection', () => ({
  ManageCouponsSection: mockSection('manage coupons section'),
}));

/*
  Handed to the screen as the navigator that holds it would, rather than
  stubbed into `@react-navigation/native`: each panel of the split view is a
  navigation tree of its own, and the real ones are rendered here.
*/
const mockNavigate = jest.fn();
const mockParams = jest.fn<() => SettingsScreenProps['route']['params']>();

const { SettingsScreen, settingsSectionsFor } =
  require('./SettingsScreen') as typeof import('./SettingsScreen');
type SettingsScreenProps = import('./SettingsScreen').SettingsScreenProps;

const SIGNED_IN = { uid: 'u1', email: 'a@example.com' };
const ALL = [
  'Account',
  'Credits',
  'Credit history',
  'API keys',
  'Manage coupons',
  'Review flags',
  'Appearance',
];

beforeEach(() => {
  mockSetMode.mockReset();
  mockNavigate.mockReset();
  mockParams.mockReturnValue(undefined);
  mockUser.mockReturnValue(null);
  mockAdmin.mockReturnValue(false);
});

function setup() {
  return renderWithApp(
    <DocumentsProvider list={new DocumentList()}>
      <SettingsScreen
        navigation={{ navigate: mockNavigate }}
        route={{ params: mockParams() }}
      />
    </DocumentsProvider>,
  );
}

/** The entries of the list, in the order they are drawn. */
function listed(view: ReturnType<typeof setup>): string[] {
  return view
    .getAllByRole('button')
    .map(button => button.props.accessibilityLabel as string | undefined)
    .filter((label): label is string => ALL.includes(label ?? ''));
}

describe('settingsSectionsFor', () => {
  it('offers the way in and the device to somebody signed out', () => {
    expect(settingsSectionsFor(false, false)).toEqual([
      'account',
      'appearance',
    ]);
    // Being an administrator is a fact about an account; with none, it is
    // not a way into anything.
    expect(settingsSectionsFor(false, true)).toEqual(['account', 'appearance']);
  });

  it('puts the account first and Appearance last, once signed in', () => {
    expect(settingsSectionsFor(true, false)).toEqual([
      'account',
      'credits',
      'history',
      'apiKeys',
      'appearance',
    ]);
  });

  it('offers coupon management and flag review to an administrator, after API keys', () => {
    expect(settingsSectionsFor(true, true)).toEqual([
      'account',
      'credits',
      'history',
      'apiKeys',
      'manageCoupons',
      'reviewFlags',
      'appearance',
    ]);
  });
});

describe('SettingsScreen', () => {
  it('lists the account and Appearance when signed out, and opens on the account', () => {
    const view = setup();
    expect(listed(view)).toEqual(['Account', 'Appearance']);
    expect(view.getByText('account section')).toBeTruthy();
  });

  it('lists what the account holds once signed in, in the dashboard order', () => {
    mockUser.mockReturnValue(SIGNED_IN);
    expect(listed(setup())).toEqual([
      'Account',
      'Credits',
      'Credit history',
      'API keys',
      'Appearance',
    ]);
  });

  it('adds coupon management for a site administrator', () => {
    mockUser.mockReturnValue(SIGNED_IN);
    mockAdmin.mockReturnValue(true);
    expect(listed(setup())).toEqual(ALL);
  });

  it('no longer lists keyboard shortcuts, Score or About', () => {
    mockUser.mockReturnValue(SIGNED_IN);
    const view = setup();
    expect(view.queryByLabelText('Keyboard shortcuts')).toBeNull();
    expect(view.queryByLabelText('Score')).toBeNull();
    expect(view.queryByLabelText('About')).toBeNull();
  });

  it('shows the section for whichever entry is chosen', () => {
    mockUser.mockReturnValue(SIGNED_IN);
    mockAdmin.mockReturnValue(true);
    const view = setup();
    for (const [entry, section] of [
      ['Credit history', 'history section'],
      ['API keys', 'api keys section'],
      ['Manage coupons', 'manage coupons section'],
    ] as const) {
      fireEvent.press(view.getByLabelText(entry));
      expect(view.getByText(section)).toBeTruthy();
    }
    // The pane was replaced each time, not added to.
    expect(view.queryByText('account section')).toBeNull();
  });

  it('shows the balance under Credits, with the coupon form beneath it', () => {
    // Redeeming a coupon is part of Credits, not an entry of its own.
    mockUser.mockReturnValue(SIGNED_IN);
    const view = setup();
    expect(view.queryByLabelText('Redeem coupon')).toBeNull();
    fireEvent.press(view.getByLabelText('Credits'));
    expect(view.getByText('12')).toBeTruthy();
    expect(view.getByText('coupon form')).toBeTruthy();
  });

  it('offers language and theme under Appearance, set as they are', () => {
    /*
      Both pickers once printed **nothing** on both simulators — a bare
      chevron in a box — because `Select`'s trigger label carried `flex: 1`.
      A test renderer performs no layout, so this cannot catch a label that
      measures zero; only one that is not rendered at all.
    */
    const view = setup();
    fireEvent.press(view.getByLabelText('Appearance'));
    expect(view.getByLabelText(/language/i)).toBeTruthy();
    expect(view.getByLabelText(/theme/i)).toBeTruthy();
    expect(view.getByText('English')).toBeTruthy();
    expect(view.getByText('Follows the system')).toBeTruthy();
  });

  it('states the build under Appearance, now that About is gone', () => {
    const view = setup();
    fireEvent.press(view.getByLabelText('Appearance'));
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { version } = require('../../package.json') as { version: string };
    expect(
      view.getByText(new RegExp(version.replace(/\./g, '\\.'))),
    ).toBeTruthy();
  });

  it('offers no developer settings, because there are none left to offer', () => {
    /*
      There was a Developer settings row here, opening a sheet of six toggles
      that no package in the family read, so every one of them did nothing at
      all. They are gone from `DevSettings` upstream.
    */
    const view = setup();
    fireEvent.press(view.getByLabelText('Appearance'));
    expect(view.queryByText(/developer/i)).toBeNull();
  });

  it('opens on the section it was asked for', () => {
    mockUser.mockReturnValue(SIGNED_IN);
    mockParams.mockReturnValue({ section: 'history', at: 1 });
    expect(setup().getByText('history section')).toBeTruthy();
  });

  it('goes back to the account when the section showing stops being offered', () => {
    // Asked for Credits, by somebody who is signed out: there is no such
    // entry for them, and the pane shows the way in rather than a section
    // the list does not name.
    mockParams.mockReturnValue({ section: 'credits', at: 1 });
    const view = setup();
    expect(view.getByText('account section')).toBeTruthy();
    expect(view.queryByText('12')).toBeNull();
  });

  it('leaves Docs, Resources and Community to the tab bar where there is one', () => {
    const view = setup();
    expect(view.queryByLabelText('Docs')).toBeNull();
    expect(view.queryByLabelText('Resources')).toBeNull();
    expect(view.queryByLabelText('Community')).toBeNull();
  });

  it('is the way to Docs, Resources and Community where there is no tab bar', () => {
    const os = Platform.OS;
    // No platform the app is built for: a desktop window has tabs too.
    Platform.OS = 'web';
    try {
      const view = setup();
      fireEvent.press(view.getByLabelText('Docs'));
      fireEvent.press(view.getByLabelText('Resources'));
      fireEvent.press(view.getByLabelText('Community'));
      expect(mockNavigate.mock.calls).toEqual([
        ['Docs'],
        ['Resources'],
        ['Community'],
      ]);
    } finally {
      Platform.OS = os;
    }
  });
});
