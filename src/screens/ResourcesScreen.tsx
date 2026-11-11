/**
 * Where to find music worth importing — now an API-driven tile list.
 *
 * The catalog used to be a static, grouped list from `@sudobility/music_lib`.
 * It is now served per (app, locale) from the shared Sudobility resources
 * catalog (central `sudobility_api`, reached through music_api's public
 * `/api/v1/resources` forwarder) and rendered by the reusable
 * `@sudobility/resources_pages_rn` tile list — the same component every
 * Sudobility app uses. Curation moved out of the codebase into the admin MCP.
 *
 * The screen keeps its `TitledScreen`/`ScreenScaffold` shell and intro line;
 * the shared component's own title is suppressed with `title: ''`. A tile shows
 * the site icon, name, description and host and opens the target with `Linking`
 * — the shared component handles all of it.
 */
import { useEffect, useMemo } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '@sudobility/components-rn';
import { ResourcesScreenConnected } from '@sudobility/resources_pages_rn';
import { ScreenScaffold } from './ScreenScaffold';
import { TitledScreen } from '@/components/layout/SplitViewContainer';
import { ensureResourcesInitialized } from '@/config/resources';
import { trackScreenView } from '@/analytics';

export function ResourcesScreen() {
  useEffect(() => {
    trackScreenView('ResourcesScreen');
  }, []);

  const { t, i18n } = useTranslation();
  // Idempotent; runs during render so the connected component's hook finds the
  // initialized singleton on its first effect.
  useMemo(() => ensureResourcesInitialized(), []);

  return (
    <TitledScreen title={t('nav.resources')}>
      <ScreenScaffold>
        {/* No scroller of its own: ScreenScaffold is already one. */}
        <View className="gap-6 pb-8">
          <Text className="text-muted-foreground text-base">
            {t('resources.intro')}
          </Text>
          <ResourcesScreenConnected
            locale={i18n.language}
            labels={{
              title: '',
              empty: t('resources.empty', 'No resources available yet.'),
              errorTitle: t('resources.errorTitle', 'Couldn’t load resources'),
            }}
          />
        </View>
      </ScreenScaffold>
    </TitledScreen>
  );
}
