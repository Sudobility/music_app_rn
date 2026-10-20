/**
 * Snapshots for the open project: what the reader sees and presses.
 *
 * Every rule about snapshots is music_client's `useProjectSnapshots`, shared
 * with the web editor, and this panel only draws what it answers and calls what
 * it offers. The native copy of those rules had drifted in the way that costs
 * the most: it re-downloaded the whole project after every create and every
 * open — resetting nothing visible, but shipping the score back down each time
 * and replacing the store's score with an identical one — and suggested a
 * different public title from the web's. The rules, now upstream:
 *
 * - **Creating one flushes the live score first**, because the server copies
 *   the *projects row* and saving is debounced.
 * - **Nothing re-downloads the project.** Creating changes no music; opening
 *   hands the score back in its own response. What both change is the row's
 *   `updatedAt`, which the hook reports through `noteServerVersion` so the
 *   generation poll does not read this client's own write as a foreign one.
 * - **There is no edit or delete.** Immutability is enforced by the absence of a
 *   route. A published *title* can still change — re-publishing sets it and
 *   keeps the first `publicId`, so a shared link survives a rename.
 * - **Opening one branches rather than overwriting**; the tree is
 *   `snapshotTree`'s.
 */
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Button, Text } from '@sudobility/components-rn';
import { Spinner } from '@/components/controls/Spinner';
import type { ProjectSnapshots } from '@sudobility/music_client';
import { flagReasonLabelKey } from '@sudobility/music_types';
import { CreateSnapshotSheet, OpenSnapshotSheet } from './SnapshotSheets';
import { DraftInput } from '@/features/inspector/DraftInput';
import {
  FieldSlot,
  SLOT_BUTTON_CLASS,
  SLOT_FIELD_CLASS,
} from '@/components/controls/FieldRow';
import { usePendingAction } from '@/components/controls/usePendingAction';

export type SnapshotsPanelProps = {
  /** `useProjectSnapshots` for this project. */
  snapshots: ProjectSnapshots;
  /** Half of the suggested public title. */
  projectName: string;
  /**
   * Opens the create form as soon as the panel is shown. For a store
   * screenshot (`ScreenshotLinks.tsx`).
   */
  startCreating?: boolean;
};

/*
  How long the create form waits for the sheet around it. Both are native
  modals, and iOS will not present one while another is still animating in —
  it logs a warning and shows nothing.
*/
const NESTED_SHEET_DELAY_MS = 500;

export function SnapshotsPanel({
  snapshots,
  projectName,
  startCreating = false,
}: SnapshotsPanelProps) {
  const { t } = useTranslation();
  const [createOpen, setCreateOpen] = useState(false);
  useEffect(() => {
    if (!startCreating) return;
    const timer = setTimeout(() => setCreateOpen(true), NESTED_SHEET_DELAY_MS);
    return () => clearTimeout(timer);
  }, [startCreating]);
  const [openOpen, setOpenOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One snapshot write at a time; the control that started it spins (an
  // unpublish is keyed by the snapshot it withdraws).
  const pending = usePendingAction<string>();
  const busy = pending.pending;

  const report = (e: unknown) =>
    setError(e instanceof Error ? e.message : String(e));
  const run = (
    key: string,
    work: () => Promise<unknown>,
    after?: () => void,
  ): void => {
    void pending.run(async () => {
      setError(null);
      try {
        await work();
      } catch (e) {
        report(e);
      } finally {
        after?.();
      }
    }, key);
  };

  const list = snapshots.snapshots;
  const loadError = snapshots.error;

  return (
    <View className="gap-2">
      <View className="flex-row gap-2">
        <Button
          variant="secondary"
          disabled={busy}
          onPress={() => setCreateOpen(true)}
        >
          {/*
            "New snapshot", not "Create snapshot": the sheet this opens has a
            Create of its own, and two controls with one name are ambiguous
            read aloud and impossible to tell apart in a test.
          */}
          {t('snapshot.newSnapshot')}
        </Button>
        <Button
          variant="secondary"
          disabled={busy || (list?.length ?? 0) === 0}
          onPress={() => setOpenOpen(true)}
        >
          {t('snapshot.history')}
        </Button>
      </View>

      {/*
        What is already public, and a way to take it back.

        Withdrawing matters more than publishing does: somebody who published
        by mistake needs the way out to be obvious, and it is the one action
        here that cannot be reached from the create form.
      */}
      {snapshots.published.length > 0 ? (
        <View className="gap-1 pt-2">
          <Text className="text-muted-foreground text-sm">
            {t('snapshot.managePublishedTitle')}
          </Text>
          {snapshots.published.map(snapshot => (
            <View key={snapshot.id} className="gap-1">
              <View className="flex-row items-center justify-between gap-2">
                {/*
                  A draft committed on blur, not per keystroke: a half-typed
                  title must never reach a public page. A blank one is refused
                  by the hook, which sends nothing.
                */}
                <FieldSlot grow>
                  <DraftInput
                    className={SLOT_FIELD_CLASS}
                    value={snapshot.publicName ?? snapshot.name}
                    accessibilityLabel={t('snapshot.publicNameFor', {
                      name: snapshot.name,
                    })}
                    onCommit={publicName => {
                      // A field committed on blur, not a call to action: it
                      // has nothing to spin and is not refused by one.
                      setError(null);
                      void snapshots
                        .rename(snapshot.id, publicName)
                        .catch(report);
                    }}
                  />
                </FieldSlot>
                <FieldSlot>
                  <Button
                    variant="ghost"
                    className={SLOT_BUTTON_CLASS}
                    disabled={busy}
                    loading={pending.pendingKey === `unpublish:${snapshot.id}`}
                    onPress={() =>
                      run(`unpublish:${snapshot.id}`, () =>
                        snapshots.unpublish(snapshot.id),
                      )
                    }
                  >
                    {t('snapshot.unpublish')}
                  </Button>
                </FieldSlot>
              </View>
              {/*
                A confirmed flag removed this from the community. The owner is
                told here, and why, since nothing else on the page would say so.
              */}
              {snapshot.removedFromCommunity ? (
                <Text className="text-destructive text-sm">
                  {t('flag.removedForReason', {
                    reason: snapshot.removalReason
                      ? t(flagReasonLabelKey(snapshot.removalReason))
                      : '',
                  })}
                </Text>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}

      {snapshots.isLoading ? <Spinner /> : null}
      {error ? <Text className="text-destructive text-sm">{error}</Text> : null}
      {!error && loadError ? (
        <Text className="text-destructive text-sm">
          {loadError instanceof Error ? loadError.message : String(loadError)}
        </Text>
      ) : null}

      <CreateSnapshotSheet
        open={createOpen}
        snapshotCount={list?.length ?? 0}
        projectName={projectName}
        {...(snapshots.defaultPublisherName
          ? { defaultPublisherName: snapshots.defaultPublisherName }
          : {})}
        onClose={() => setCreateOpen(false)}
        busy={pending.pendingKey === 'create'}
        onCreate={(name, publisherName, publicName) =>
          // The sheet stays up, Create spinning, until the server answers;
          // either way it then closes, and a failure is reported here.
          run(
            'create',
            async () => {
              // Published in the same step it is created, because that is how
              // the sheet asks it: publishing is a tick on the create form
              // rather than a second trip through a list.
              await snapshots.create({
                name,
                ...(publisherName && publicName
                  ? { publish: { publisherName, publicName } }
                  : {}),
              });
            },
            () => setCreateOpen(false),
          )
        }
      />

      <OpenSnapshotSheet
        open={openOpen}
        nodes={snapshots.nodes}
        onClose={() => setOpenOpen(false)}
        busy={pending.pendingKey === 'open'}
        onSnapshotFirst={() => {
          // The non-destructive escape: keep the current work, then come back.
          setOpenOpen(false);
          setCreateOpen(true);
        }}
        onOpen={snapshotId =>
          run(
            'open',
            () => snapshots.open(snapshotId),
            () => setOpenOpen(false),
          )
        }
      />
    </View>
  );
}
