/**
 * Settings, as master and detail — the account first, then what the account
 * holds, then what belongs to the device. The split view is
 * `sudojo_app_rn`'s (`SplitViewContainer`): a list with its own navigation
 * bar, and the chosen section beside it under a bar of its own.
 *
 * **What is listed depends on who is signed in.** Signed out there is the
 * account — which is then the sign-in form — and Appearance. Signed in there
 * is everything the web dashboard offers, in its order: Credits (which holds
 * the coupon form), Credit history, API keys, and Manage coupons for a site
 * administrator. The account's sections are not listed for somebody with no
 * account: each would be a page saying only "sign in", under the one entry
 * that does exactly that.
 *
 * **Appearance is last**, as the one section that is about the app rather
 * than the person.
 *
 * Docs, Resources and Community are tabs where there is a tab bar. Without
 * one this screen is still the way to them, so they are listed after the
 * sections and leave the screen rather than fill the pane.
 */
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AppVersion, Select, Text } from '@sudobility/components-rn';
import { version as appVersion } from '../../package.json';
import { CONSTANTS } from '@/config/constants';
import { useTheme } from '@/config/ThemeContext';
import { devicePrefs } from '@/config/useDevicePrefs';
import { THEME_MODE_OPTIONS } from '@sudobility/music_types';
import type { ThemeMode } from '@sudobility/music_types';
import { SUPPORTED_LANGUAGES } from '@/i18n';
import { hasTabBar } from '@/app/tab-bar';
import type { MainTabParamList } from '@/app/Navigation';
import { ScreenBackBar } from '@/components/layout/ScreenBackBar';
import {
  SplitMenuList,
  SplitPanel,
  SplitViewContainer,
} from '@/components/layout/SplitViewContainer';
import { useAuth } from '@/auth/AuthContext';
import { useSiteAdmin } from '@/auth/useSiteAdmin';
import { CreditsScreen } from './CreditsScreen';
import { ScreenScaffold } from './ScreenScaffold';
import { AccountSection } from './settings/AccountSection';
import { ApiKeysSection } from './settings/ApiKeysSection';
import { CreditHistorySection } from './settings/CreditHistorySection';
import { ManageCouponsSection } from './settings/ManageCouponsSection';
import { ReviewFlagsSection } from './settings/ReviewFlagsSection';
import { trackScreenView } from '@/analytics';

/** The sections, in the order they are listed. */
export const SETTINGS_SECTIONS = [
  'account',
  'credits',
  'history',
  'apiKeys',
  'manageCoupons',
  'reviewFlags',
  'appearance',
] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

/** A record, so a section added to the list fails to compile without a name. */
const SECTION_LABEL: Record<SettingsSection, string> = {
  account: 'settings.account',
  credits: 'nav.credits',
  history: 'dashboard.creditHistory',
  apiKeys: 'dashboard.apiKeys',
  manageCoupons: 'dashboard.manageCoupons',
  reviewFlags: 'dashboard.reviewFlags',
  appearance: 'settings.page.appearanceLabel',
};

/** What is offered whoever is asking: the way in, and the device's own. */
const FOR_EVERYONE: readonly SettingsSection[] = ['account', 'appearance'];
/** What only a site administrator is offered. */
const ADMIN_ONLY: readonly SettingsSection[] = ['manageCoupons', 'reviewFlags'];

/** The sections offered to this reader, in the listed order. */
export function settingsSectionsFor(
  signedIn: boolean,
  siteAdmin: boolean,
): SettingsSection[] {
  return SETTINGS_SECTIONS.filter(section => {
    if (FOR_EVERYONE.includes(section)) return true;
    if (!signedIn) return false;
    return siteAdmin || !ADMIN_ONLY.includes(section);
  });
}

/** Where this screen leads when nothing else does — see the file comment. */
const LINKS = [
  { route: 'Docs', labelKey: 'nav.docs' },
  { route: 'Resources', labelKey: 'nav.resources' },
  { route: 'Community', labelKey: 'nav.community' },
] as const;

/**
 * What the screen is handed by whichever navigator holds it — a tab under a
 * tab bar, a stack screen without one. Taken as props rather than through
 * `useNavigation()`, because the panels below are navigation trees of their
 * own and that hook would answer theirs.
 */
export type SettingsScreenProps = {
  navigation: { navigate: (route: 'Docs' | 'Resources' | 'Community') => void };
  route: { params?: MainTabParamList['Settings'] };
};

export function SettingsScreen({ navigation, route }: SettingsScreenProps) {
  useEffect(() => {
    trackScreenView('SettingsScreen');
  }, []);

  const { t } = useTranslation();
  const { user } = useAuth();
  const siteAdmin = useSiteAdmin();
  const sections = settingsSectionsFor(user !== null, siteAdmin);
  const [chosen, setChosen] = useState<SettingsSection>('account');
  // What is shown is what is listed: signing out while Credits is showing
  // takes Credits off the list, and the pane goes back to the first entry
  // rather than showing a section the list no longer names.
  const section = sections.includes(chosen) ? chosen : sections[0]!;

  // A section asked for from outside the screen.
  const requested = route.params?.section;
  const requestedAt = route.params?.at;
  useEffect(() => {
    if (requested !== undefined) setChosen(requested);
  }, [requested, requestedAt]);

  const entries = [
    ...sections.map(id => ({ id, label: t(SECTION_LABEL[id]) })),
    ...(hasTabBar()
      ? []
      : LINKS.map(link => ({ id: link.route, label: t(link.labelKey) }))),
  ];

  const choose = (id: string) => {
    const link = LINKS.find(candidate => candidate.route === id);
    if (link) navigateTo(navigation, link.route);
    else setChosen(id as SettingsSection);
  };

  return (
    <View className="bg-background flex-1">
      {/* The way back; nothing at all where the navigator draws its own. */}
      <View className="px-4">
        <ScreenBackBar />
      </View>
      <SplitViewContainer
        collapsible
        primaryPanel={
          <SplitPanel title={t('nav.settings')}>
            <SplitMenuList
              label={t('nav.settings')}
              entries={entries}
              selected={section}
              onSelect={choose}
            />
          </SplitPanel>
        }
        secondaryPanel={
          <SplitPanel secondary title={t(SECTION_LABEL[section])}>
            {section === 'account' ? <AccountSection /> : null}
            {section === 'credits' ? <CreditsScreen /> : null}
            {section === 'history' ? <CreditHistorySection /> : null}
            {section === 'apiKeys' ? <ApiKeysSection /> : null}
            {section === 'manageCoupons' ? <ManageCouponsSection /> : null}
            {section === 'reviewFlags' ? <ReviewFlagsSection /> : null}
            {section === 'appearance' ? <AppearanceSection /> : null}
          </SplitPanel>
        }
      />
    </View>
  );
}

/*
  One call per destination, each naming its route as a literal:
  `screens-reachable.test.ts` finds a screen's way in by reading the source
  for `navigate('Docs'`, and a route held in a variable is one it cannot see.
*/
function navigateTo(
  navigation: SettingsScreenProps['navigation'],
  route: (typeof LINKS)[number]['route'],
): void {
  if (route === 'Docs') navigation.navigate('Docs');
  else if (route === 'Resources') navigation.navigate('Resources');
  else navigation.navigate('Community');
}

function AppearanceSection() {
  const { t, i18n } = useTranslation();
  const { mode, setMode } = useTheme();
  return (
    <ScreenScaffold>
      <Row label={t('settings.language')}>
        <Select
          value={i18n.language.startsWith('zh') ? 'zh' : 'en'}
          // A select's visible label sits outside it, so without this a screen
          // reader announces only the value — "English", with no word for what
          // is English.
          accessibilityLabel={t('settings.language')}
          options={SUPPORTED_LANGUAGES.map(code => ({
            value: code,
            label: t(`settings.language_${code}`),
          }))}
          // A device pref, so the choice survives a relaunch; the composition
          // root keeps i18next on whatever the prefs store says.
          onValueChange={(value: string) =>
            devicePrefs.getState().setLanguage(value)
          }
        />
      </Row>

      {/*
        `system` is offered alongside the two overrides rather than being the
        absence of one: "follow the OS again" is a choice a reader makes, and it
        is remembered like any other.
      */}
      <Row label={t('settings.theme')}>
        <Select
          value={mode}
          accessibilityLabel={t('settings.theme')}
          options={THEME_MODE_OPTIONS.map(option => ({
            value: option.value,
            label: t(option.labelKey),
          }))}
          onValueChange={(value: string) => setMode(value as ThemeMode)}
        />
      </Row>

      {/* The build, which a bug report needs and nothing else states. Read
          from `package.json`, which `push_all` bumps and syncs to the native
          platform files — so there is one version, not a second one typed.
          Here since the About screen went: it was the only place it showed. */}
      <View className="pt-2">
        <AppVersion appName={CONSTANTS.APP_NAME} version={appVersion} />
      </View>
    </ScreenScaffold>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View className="border-border flex-row items-center justify-between border-b py-3">
      <Text className="text-foreground">{label}</Text>
      {children}
    </View>
  );
}
