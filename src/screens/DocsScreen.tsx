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
import { ScreenBackBar } from '@/components/layout/ScreenBackBar';
import {
  SplitMenuList,
  SplitPanel,
  SplitViewContainer,
} from '@/components/layout/SplitViewContainer';
import type { SplitMenuEntry } from '@/components/layout/SplitViewContainer';
import { Button, Text } from '@sudobility/components-rn';

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
  const [topicId, setTopicId] = useState<string>(DOCS_TOPICS[0]?.id ?? '');
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const topic = DOCS_TOPICS.find(d => d.id === topicId);

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
        primaryPanel={
          <SplitPanel title={t('docs.title')}>
            <SplitMenuList
              label={t('docs.title')}
              entries={entries}
              selected={topicId}
              onSelect={setTopicId}
            />
          </SplitPanel>
        }
        secondaryPanel={
          // Untitled: a topic names itself at the top of what it says.
          <SplitPanel
            secondary
            title={topic ? t(topic.title) : t('docs.title')}
          >
            <ScrollView
              className="flex-1"
              contentContainerClassName="p-6 gap-3"
            >
              {topic ? (
                <>
                  <Text className="text-muted-foreground text-base">
                    {t(topic.summary)}
                  </Text>
                  {/*
              The element the topic is about, captured from this app. Nothing
              for a topic that has no figure.
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
              The live-data sections. Prose about a table is a copy of that
              table, so the instrument list is read from the catalogue and the
              shortcuts from the bindings — neither can go stale.
            */}
                  {topic.widget === 'instruments' ? (
                    <InstrumentReference />
                  ) : null}
                  {/*
              The format tables. This branch was missing entirely, so the topic
              that carries `widget: 'formats'` rendered a heading with nothing
              under it — the one place the docs promised a table and showed
              none.
            */}
                  {topic.widget === 'formats' ? <FormatReference /> : null}
                  {/*
              The shortcut table is a sheet of its own, so this opens it
              rather than printing it twice — but it points *actionably*. It
              used to be a sentence naming a screen with no way to reach it,
              which is a dead end dressed as a cross-reference.
            */}
                  {topic.widget === 'shortcuts' ? (
                    <Button
                      variant="outline"
                      onPress={() => setShortcutsOpen(true)}
                    >
                      {t('docs.seeShortcutsScreen')}
                    </Button>
                  ) : null}
                </>
              ) : null}
            </ScrollView>
          </SplitPanel>
        }
      />
      <ShortcutsSheet
        open={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
      />
    </View>
  );
}
