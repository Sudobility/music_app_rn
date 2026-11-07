/**
 * The bottom status strip, mirroring the web app's.
 *
 * Same content and same order: what is selected on the left, and the
 * validation issues on the right.
 *
 * The left half used to say the active track's name and a bar/track count,
 * which is not what this comment claimed and not what the web app shows. Both
 * were also answers you already had: the track's name is painted into the
 * canvas gutter beside every system, by the renderer both apps share. What was
 * missing is the one thing a status strip is for — what you have selected —
 * and `selectionSummaryLabel` is music_types', so the two apps read a
 * selection with the same function and differ only in the words.
 *
 * The issue count is the one control here that does anything, and it is the
 * right place for it: an issue is something the score *has*, so it belongs
 * beside the other things the strip reports rather than among the tools. It
 * says nothing at all when the score is clean, which is almost always — a
 * permanent "0 issues" is a permanent invitation to stop reading the strip.
 */
import { View } from 'react-native';
import { useStore } from 'zustand';
import { useTranslation } from 'react-i18next';
import { Text, touchSlop } from '@sudobility/components-rn';
import { selectionSummaryLabel } from '@sudobility/music_types';
import { libraryCopy } from '@/config/initialize';
import { Pressable } from 'react-native';
import { useState } from 'react';
import { IssuesSheet } from '@sudobility/music_ui_rn';
import type { MusicDocument } from '@/documents/document';

export function StatusBar({ document }: { document: MusicDocument }) {
  const { t } = useTranslation();
  const selection = useStore(document.store, s => s.selection);
  const regenerated = useStore(document.store, s => s.selectionRegenerated);
  const issues = useStore(document.store, s => s.validationIssues);
  const errors = issues.filter(i => i.severity === 'error').length;
  const [issuesOpen, setIssuesOpen] = useState(false);
  const openIssues = () => setIssuesOpen(true);

  return (
    <View className="bg-card flex-row items-center gap-3 px-3 py-1">
      <Text className="text-muted-foreground text-sm" numberOfLines={1}>
        {selectionSummaryLabel(selection, libraryCopy.selection(), regenerated)}
      </Text>
      <View className="flex-1" />
      {issues.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('editor.validationIssues')}
          onPress={openIssues}
          // macOS has no synthesized-touch fallback for an assistive press, so
          // a VoiceOver activation reaches a Pressable only through
          // `onAccessibilityTap` — `onPress` is a touch/mouse responder.
          onAccessibilityTap={openIssues}
          // A bare run of text, so the drawn size is the text's — the slop is
          // the whole touch target here rather than a top-up.
          hitSlop={touchSlop(0, 0)}
        >
          <Text
            className={
              errors > 0
                ? 'text-destructive text-sm'
                : 'text-muted-foreground text-sm'
            }
          >
            {t('editor.issues', { count: issues.length })}
          </Text>
        </Pressable>
      ) : null}
      <IssuesSheet
        open={issuesOpen}
        document={document}
        onClose={() => setIssuesOpen(false)}
      />
    </View>
  );
}
