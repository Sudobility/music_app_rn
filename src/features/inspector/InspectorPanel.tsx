/**
 * The property sheet, mirroring the web app's.
 *
 * Four tabs in music_types' `INSPECTOR_TABS` order — Score, Track, Note,
 * Bar — which is the web's, so a reader moving between the apps finds each
 * tab in the same place. The tab a selection opens is `defaultInspectorTab`:
 * what the selection is *of*, or Track when nothing is selected, since there
 * is always an active track and the Note and Bar tabs are an empty state until
 * something is. This panel had its own order (Track, Note, Bar, Score) and
 * always opened on Track, so tapping a note left its properties a tab away.
 *
 * Reflects and invokes only. Every edit is a `music_editing` action, because
 * the rules those enforce are rules about a score.
 *
 * The tab strip is `SegmentedTabs`, which is a real `UISegmentedControl` on
 * iOS and iPadOS and a tab row everywhere else — a four-way section picker at
 * the top of a panel is what that control is for, and the drawn strip it
 * replaced read as a web page's rather than as part of the app.
 */
import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useStore } from 'zustand';
import { useTranslation } from 'react-i18next';
import { defaultInspectorTab } from '@sudobility/music_editing';
import { SegmentedTabs } from '@sudobility/music_ui_rn';
import { TrackTab } from './TrackTab';
import { NoteTab } from './NoteTab';
import { MeasureTab } from './MeasureTab';
import { ScoreTab } from './ScoreTab';
import type { ReplaceScope } from '@sudobility/music_types';
import type { MusicDocument } from '@/documents/document';
import type { GenerationChoicesProps } from '@/features/generation/GenerationChoices';
import type { ProjectOriginProps } from '@/features/generation/ProjectOriginPanel';
import {
  INSPECTOR_TABS,
  INSPECTOR_TAB_LABEL_KEY,
} from '@sudobility/music_types';
import type { InspectorTab } from '@sudobility/music_types';

export type InspectorPanelProps = {
  document: MusicDocument;
  /**
   * Asks the server to rewrite part of the score.
   *
   * Threaded to the tabs rather than sitting on the toolbar, because the scope
   * *is* the tab: Replace Notes belongs beside the note you have selected,
   * Replace Measures beside the bars, Replace Track beside the part. On the
   * toolbar all three are equally far from the thing they act on, and a reader
   * has to work out which region each one means.
   *
   * Absent when there is no project behind the document — a local file has no
   * row for a job to write back to.
   */
  onReplace?: (scope: ReplaceScope) => void;
  /** Generate Again, shown under the Score tab's fields, as on the web. */
  generation?: GenerationChoicesProps;
  /** Where the project came from, shown above Generate Again, as on the web. */
  origin?: ProjectOriginProps;
};

export function InspectorPanel({
  document,
  onReplace,
  generation,
  origin,
}: InspectorPanelProps) {
  const { t } = useTranslation();
  const selection = useStore(document.store, s => s.selection);
  const [tab, setTab] = useState<InspectorTab>(() =>
    defaultInspectorTab(selection),
  );
  /*
    Re-derived when the selection changes — a fresh tap on a note, a bar or a
    track — and otherwise left alone, so the reader's own choice of tab between
    selections is not fought. The web panel's effect, on the same three lists.
  */
  useEffect(() => {
    setTab(defaultInspectorTab(selection));
  }, [selection.eventIds, selection.measureIds, selection.trackIds]);

  return (
    <View className="flex-1" accessibilityLabel={t('editor.inspector')}>
      <SegmentedTabs
        label={t('editor.inspector')}
        options={INSPECTOR_TABS.map(value => ({
          value,
          label: t(INSPECTOR_TAB_LABEL_KEY[value]),
        }))}
        value={tab}
        onChange={value => setTab(value as InspectorTab)}
        testID="inspector-tabs"
      />
      <ScrollView className="flex-1" contentContainerClassName="p-3 gap-3">
        {tab === 'score' ? (
          <ScoreTab
            document={document}
            {...(generation ? { generation } : {})}
            {...(origin ? { origin } : {})}
          />
        ) : null}
        {tab === 'track' ? (
          <TrackTab document={document} {...(onReplace ? { onReplace } : {})} />
        ) : null}
        {tab === 'note' ? (
          <NoteTab document={document} {...(onReplace ? { onReplace } : {})} />
        ) : null}
        {tab === 'measure' ? (
          <MeasureTab
            document={document}
            {...(onReplace ? { onReplace } : {})}
          />
        ) : null}
      </ScrollView>
    </View>
  );
}
