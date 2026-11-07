/**
 * The row that says a job owns this score — a generation, or the
 * transcription of a recording — while the notes it writes appear in the
 * score above.
 *
 * A generation is a job, not a request that resolves: `POST /jobs` returns as
 * soon as the row exists and the work happens afterwards — and the work is
 * streamed, part by part, into the score. So this is a strip rather than a
 * cover: the score is the point, and a reader who opened the project to watch
 * it must be able to see it. What must not happen underneath is an edit or a
 * play, and neither can — the store's edit lock refuses content commands, the
 * score's touch handlers are dropped, and the transport's Play is disabled.
 * The strip is what tells the reader why.
 *
 * Cancel is offered because it is cheap and honest: cancelling writes `ready`,
 * and the running job discards its result when it next looks — including
 * between chunks of a long one. The notes written so far stay.
 */
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Button, Text } from '@sudobility/components-rn';
import { Spinner } from '@sudobility/music_ui_rn';
import type {
  LiveGenerationProgress,
  ProjectStatus,
} from '@sudobility/music_types';
import type { LiveStatus } from '@sudobility/music_client';

export function GenerationOverlay({
  visible,
  status = 'generating',
  error,
  progress = null,
  live = 'off',
  onCancel,
}: {
  visible: boolean;
  /**
   * Which kind of job it is. The two lock the editor identically and stream
   * the same way; what differs is the sentence.
   */
  status?: ProjectStatus;
  error: string | null;
  /** The stream's last progress note, when there is one. */
  progress?: LiveGenerationProgress | null;
  /** Where the live stream stands: only its troubles are worth a word. */
  live?: LiveStatus;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  if (!visible) return null;
  const transcribing = status === 'transcribing';
  return (
    <View
      testID="generation-status-strip"
      accessibilityRole="summary"
      className="border-border bg-background flex-row flex-wrap items-center gap-x-3 gap-y-1 border-t px-4 py-2"
    >
      <Spinner />
      <Text className="text-foreground text-base">
        {t(transcribing ? 'overlay.transcribingNotes' : 'generate.working')}
      </Text>
      {progress ? (
        <Text className="text-muted-foreground text-sm">
          {t('overlay.progress', {
            // A transcription's first stage splits the recording into
            // parts; "Planning" is what a generation does before it writes.
            stage:
              transcribing && progress.stage === 'plan'
                ? t('overlay.stage.separate')
                : t(`overlay.stage.${progress.stage}`),
            done: progress.done,
            total: progress.total,
            label: progress.label,
          })}
        </Text>
      ) : null}
      {live === 'reconnecting' ? (
        <Text className="text-muted-foreground text-sm">
          {t('overlay.reconnecting')}
        </Text>
      ) : live === 'fallback' ? (
        <Text className="text-muted-foreground text-sm">
          {t('overlay.polling')}
        </Text>
      ) : null}
      <Text className="text-muted-foreground text-sm">
        {t('overlay.lockedWhileGenerating')}
      </Text>
      {error ? <Text className="text-destructive text-sm">{error}</Text> : null}
      <View className="flex-1" />
      <Button variant="secondary" onPress={onCancel}>
        {t('common.cancel')}
      </Button>
    </View>
  );
}
