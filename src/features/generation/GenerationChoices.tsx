/**
 * Generate Again: the choices the last generation was built from, a lock beside
 * each, and a button that rolls the rest.
 *
 * The web app's panel, and it replaces this app's in-editor Generate Score
 * sheet. That sheet asked for a whole new score from inside the project already
 * open, which the web had stopped offering — whole-score generation is where a
 * project starts (New Project), and what an open project offers is *another
 * take on the same request*. Two generations of one request are two pieces,
 * because the server rolls a groove, a chord cycle, a hook and the rest afresh
 * each time; locking one keeps it and re-rolls the others.
 *
 * Which choices are lockable, their order, how the melody carrier is shown and
 * what a lock actually sends are music_lib's (`lockableChoiceRows`,
 * `lockableChoiceValue`, `regenerateWithLocks`), so this panel cannot lock
 * something the web's does not. The request itself is built by the caller,
 * which owns the generation runner.
 *
 * Generating again replaces the whole score, so it asks first.
 */
import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Button, Switch, Text } from '@sudobility/components-rn';
import {
  generationChoiceLabelKey,
  lockableChoiceRows,
  lockableChoiceValue,
  regenerateCreditEstimate,
} from '@sudobility/music_lib';
import type { LockableChoice } from '@sudobility/music_lib';
import type { GenerationRecord } from '@sudobility/music_types';
import { ConfirmSheet } from '@sudobility/music_ui_rn';
import { usePendingAction } from '@sudobility/music_ui_rn';

export type GenerationChoicesProps = {
  record: GenerationRecord;
  /** True while a job owns the project: nothing can be started then. */
  generating: boolean;
  /**
   * The locked choices, in the order they are shown. Answers once the job has
   * been accepted (or refused): until then the confirm spins and stays up.
   */
  onGenerateAgain: (lockedKeys: LockableChoice[]) => void | Promise<void>;
};

export function GenerationChoices({
  record,
  generating,
  onGenerateAgain,
}: GenerationChoicesProps) {
  const { t } = useTranslation();
  const [locked, setLocked] = useState<ReadonlySet<LockableChoice>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const starting = usePendingAction();

  const rows = lockableChoiceRows(record);
  // The same request again, so the same bill: its bars times its tracks.
  const estimatedCredits = regenerateCreditEstimate(record);

  const toggle = (key: LockableChoice): void =>
    setLocked(current => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <View className="gap-2">
      <Text className="text-foreground text-sm font-semibold">
        {t('generationChoices.heading')}
      </Text>
      <Text className="text-muted-foreground text-sm">
        {t('generationChoices.hint')}
      </Text>
      {rows.map(key => {
        const name = t(generationChoiceLabelKey(key));
        return (
          <View key={key} className="flex-row items-center gap-2">
            <Switch
              checked={locked.has(key)}
              disabled={generating}
              onCheckedChange={() => toggle(key)}
              accessibilityLabel={t('generationChoices.lock', { name })}
            />
            <Text className="text-muted-foreground text-sm">{`${name}:`}</Text>
            <Text className="text-foreground flex-1 text-sm" numberOfLines={2}>
              {lockableChoiceValue(record.choices, key)}
            </Text>
          </View>
        );
      })}
      <View className="flex-row">
        <Button
          variant="secondary"
          size="sm"
          disabled={generating}
          loading={starting.pending}
          onPress={() => setConfirming(true)}
        >
          {locked.size > 0
            ? t('generationChoices.againKeeping', { count: locked.size })
            : t('generationChoices.again')}
        </Button>
      </View>
      {estimatedCredits > 0 ? (
        <Text className="text-muted-foreground text-sm">
          {t('generate.estimate', { count: estimatedCredits })}
        </Text>
      ) : null}
      <ConfirmSheet
        open={confirming}
        title={t('generationChoices.confirmTitle')}
        message={t('generationChoices.confirmMessage')}
        confirmLabel={t('generationChoices.confirm')}
        destructive
        busy={starting.pending}
        onCancel={() => setConfirming(false)}
        onConfirm={() =>
          void starting.run(async () => {
            try {
              await onGenerateAgain(rows.filter(key => locked.has(key)));
            } finally {
              setConfirming(false);
            }
          })
        }
      />
    </View>
  );
}
