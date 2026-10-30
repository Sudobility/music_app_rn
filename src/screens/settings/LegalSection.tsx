/**
 * The Privacy Policy and the Terms of Service, one Settings section each.
 *
 * The web app has neither page, so there is nothing to mirror here; the
 * wording is this app's own (it follows `sudojo_app_rn`'s, adapted to a music
 * app) and lives in the locales, so both documents translate like everything
 * else — `locale-parity` holds the two languages level.
 *
 * Drawn with this app's own components, not building_blocks_rn's
 * `AppTextScreen`: that one reads a theme context this app never mounts and
 * throws at render. A legal document needs no account and no server, so both
 * are offered signed out (`settingsSectionsFor`). The panel's own bar already
 * names the document, so the body opens on the "last updated" line rather than
 * repeating the title.
 */
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Text } from '@sudobility/components-rn';
import { CONSTANTS } from '@/config/constants';
import { ScreenScaffold } from '../ScreenScaffold';

export type LegalDocument = 'privacy' | 'terms';

/** The sections of each document, in the order they are shown. */
const SECTIONS: Record<LegalDocument, readonly string[]> = {
  privacy: [
    'introduction',
    'collection',
    'usage',
    'sharing',
    'security',
    'retention',
    'rights',
    'cookies',
    'children',
    'transfers',
    'changes',
    'language',
  ],
  terms: [
    'acceptance',
    'service',
    'accounts',
    'usage',
    'payments',
    'ip',
    'liability',
    'termination',
    'changes',
    'language',
  ],
};

/**
 * When each document was last revised. Stated here rather than read from the
 * clock, so the date shown is the policy's own and not the day it was opened.
 */
const LAST_UPDATED = '2026-10-29';

export function LegalSection({ doc }: { doc: LegalDocument }) {
  const { t } = useTranslation();
  // The branding and contact details the documents interpolate; the extra
  // values are harmless to the strings that name none of them.
  const values = {
    appName: CONSTANTS.APP_NAME,
    companyName: CONSTANTS.COMPANY_NAME,
    email: CONSTANTS.SUPPORT_EMAIL,
    website: `https://${CONSTANTS.APP_DOMAIN}`,
    date: new Date(LAST_UPDATED).toLocaleDateString(),
  };
  return (
    <ScreenScaffold>
      <Text className="text-muted-foreground text-sm">
        {t(`${doc}.lastUpdated`, values)}
      </Text>
      {SECTIONS[doc].map(id => (
        <View key={id} className="gap-1.5">
          <Text className="text-foreground text-lg font-semibold">
            {t(`${doc}.sections.${id}.title`, values)}
          </Text>
          <Text className="text-muted-foreground text-base leading-6">
            {t(`${doc}.sections.${id}.body`, values)}
          </Text>
        </View>
      ))}
      <View className="gap-1.5">
        <Text className="text-foreground text-lg font-semibold">
          {t(`${doc}.contact.title`, values)}
        </Text>
        <Text className="text-muted-foreground text-base leading-6">
          {t(`${doc}.contact.body`, values)}
        </Text>
      </View>
    </ScreenScaffold>
  );
}
