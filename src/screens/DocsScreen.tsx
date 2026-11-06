/**
 * The documentation, master–detail as on the web.
 *
 * The topic list and its i18n keys come from `DOCS_TOPICS` in
 * `@sudobility/music_lib`, so the two apps document the same product from
 * one description — the web's own docs page is built the same way, from
 * structure plus copy keys rather than prose in the component.
 *
 * Three of the web's sections are built from live data rather than described in
 * prose — the instrument table reads the GM catalogue, the shortcut table reads
 * `SHORTCUTS`, and the format tables read the format list — because prose about
 * a table is a copy of that table. The instrument and shortcut sections do the
 * same here; the shortcut one is a sheet of its own.
 *
 * A topic about the interface opens with a figure of the element it is about
 * (`features/docs/figures.ts`) — the element, not the screen it sits on.
 */
import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NavigationProp, RouteProp } from '@react-navigation/native';
import { ScreenBackBar } from '@/components/layout/ScreenBackBar';
import { useNavigationTheme } from '@/app/useNavigationTheme';
import type { MainTabParamList } from '@/app/Navigation';
import {
  DETAIL_MAX_WIDTH,
  EmbeddedScreen,
} from '@/components/layout/EmbeddedScreen';
import { useDetailScroll } from '@/components/layout/detail-safe-area';
import { usePrimaryPanelWidth } from '@/components/layout/SplitViewContainer';
import {
  Button,
  SplitViewContainer,
  SplitMenuList,
  Text,
  type SplitMenuEntry,
} from '@sudobility/components-rn';

import { InstrumentReference } from '@/features/docs/InstrumentReference';
import { FormatReference } from '@/features/docs/FormatReference';
import { DocsFigure } from '@/features/docs/DocsFigure';
import { ShortcutsSheet } from '@/features/shortcuts/ShortcutsSheet';
import { DOCS_GROUPS } from '@sudobility/music_types';
import type { DocsGroup } from '@sudobility/music_types';
import { DOCS_TOPICS, docsGroupLabelKey } from '@sudobility/music_lib';
import { trackScreenView } from '@/analytics';

export function DocsScreen() {
  useEffect(() => {
    trackScreenView('DocsScreen');
  }, []);

  const { t } = useTranslation();
  const masterWidth = usePrimaryPanelWidth();
  const navTheme = useNavigationTheme();
  // The selection is the route's own param, so a deep link to `docs/:topicId`
  // opens that topic and the URL and the screen are one address — the web's
  // model, driven by the host's route rather than an internal navigator a deep
  // link cannot reach. An unknown id (`docs/bogus`) is treated as no selection:
  // the list leads and the first topic fills the detail beside it, rather than a
  // blank pane — the web redirects `/docs` to the first topic the same way.
  const route = useRoute<RouteProp<MainTabParamList, 'Docs'>>();
  const navigation = useNavigation<NavigationProp<MainTabParamList, 'Docs'>>();
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const selectedId = route.params?.topicId;
  const selectedTopic = selectedId
    ? DOCS_TOPICS.find(d => d.id === selectedId)
    : undefined;
  // Only a *valid* selection drills into the detail; an unknown id falls back.
  const mobileView: 'navigation' | 'content' = selectedTopic
    ? 'content'
    : 'navigation';
  const topic = selectedTopic ?? DOCS_TOPICS[0];
  const shownId = topic?.id ?? '';
  const selectTopic = (id: string) => navigation.setParams({ topicId: id });

  /*
    Under the web's group headings — Start here, Using the app, Reference —
    through music_lib's `docsGroupLabelKey`. The list was one flat run of
    sixteen topics here, so a reader looking for the reference tables had
    nothing to navigate by.
  */
  const entries: SplitMenuEntry[] = DOCS_GROUPS.flatMap((group: DocsGroup) => {
    const topics = DOCS_TOPICS.filter(d => d.group === group);
    if (topics.length === 0) return [];
    return [
      {
        id: `group:${group}`,
        label: t(docsGroupLabelKey(group)),
        heading: true,
      },
      ...topics.map(d => ({ id: d.id, label: t(d.title) })),
    ];
  });

  return (
    <View className="bg-background flex-1">
      {/* The way back; nothing at all where the stack draws its own header. */}
      <View className="px-4">
        <ScreenBackBar />
      </View>
      <SplitViewContainer
        collapsible
        masterWidth={masterWidth}
        navigationTheme={navTheme}
        masterTitle={t('docs.title')}
        detailTitle={topic ? t(topic.title) : t('docs.title')}
        detailMaxWidth={DETAIL_MAX_WIDTH}
        // Controlled / deep-link mode: the route owns the selection, so
        // `docs/:topicId` resolves straight to the topic — two columns when
        // wide, the topic over the list when narrow with a back control. The
        // container's `Panel`s keep the red bar chrome and clear the side safe
        // area, as Settings and Projects do (which bypassing the container for
        // `MasterDetailLayout` directly did not).
        mobileView={mobileView}
        onBackToNavigation={() => navigation.setParams({ topicId: undefined })}
        backButtonText={t('docs.title')}
        master={
          <SplitMenuList
            label={t('docs.title')}
            entries={entries}
            selected={shownId}
            onSelect={selectTopic}
          />
        }
        detail={
          <EmbeddedScreen>
            <DocsTopicView
              topic={topic}
              onOpenShortcuts={() => setShortcutsOpen(true)}
            />
          </EmbeddedScreen>
        }
      />
      <ShortcutsSheet
        open={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
      />
    </View>
  );
}

/**
 * The chosen topic, in the detail pane. A `ScrollView`, so it follows the one
 * rule for a vertically-scrollable surface (`useDetailScroll`): full-bleed with
 * a scroll inset, its sides left to the split view which already cleared them.
 */
function DocsTopicView({
  topic,
  onOpenShortcuts,
}: {
  topic: (typeof DOCS_TOPICS)[number] | undefined;
  onOpenShortcuts: () => void;
}) {
  const { t } = useTranslation();
  const detail = useDetailScroll({ gap: 12 });
  return (
    <ScrollView {...detail} className="flex-1">
      {topic ? (
        <>
          <Text className="text-muted-foreground text-base">
            {t(topic.summary)}
          </Text>
          {/*
            The element the topic is about, captured from this app. Nothing for
            a topic that has no figure.
          */}
          <DocsFigure topic={topic.id} />
          {topic.sections.map(section => (
            <View key={section.heading} className="gap-1 pt-2">
              <Text className="text-foreground font-medium">
                {t(section.heading)}
              </Text>
              {section.body.map(key => (
                <Text key={key} className="text-foreground text-base">
                  {t(key)}
                </Text>
              ))}
            </View>
          ))}
          {/*
            The live-data sections. Prose about a table is a copy of that table,
            so the instrument list is read from the catalogue and the shortcuts
            from the bindings — neither can go stale.
          */}
          {topic.widget === 'instruments' ? <InstrumentReference /> : null}
          {/*
            The format tables. This branch was missing entirely, so the topic
            that carries `widget: 'formats'` rendered a heading with nothing
            under it — the one place the docs promised a table and showed none.
          */}
          {topic.widget === 'formats' ? <FormatReference /> : null}
          {/*
            The shortcut table is a sheet of its own, so this opens it rather
            than printing it twice — but it points *actionably*. It used to be a
            sentence naming a screen with no way to reach it, which is a dead
            end dressed as a cross-reference.
          */}
          {topic.widget === 'shortcuts' ? (
            <Button variant="outline" onPress={onOpenShortcuts}>
              {t('docs.seeShortcutsScreen')}
            </Button>
          ) : null}
        </>
      ) : null}
    </ScrollView>
  );
}
