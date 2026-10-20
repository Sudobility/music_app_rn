/**
 * The site-admin flag review queue. Site administrators only.
 *
 * The list is what offers this section (`SettingsScreen` asks `siteAdmin`), and
 * the server is what enforces it — a request from anyone else is refused there,
 * shown here as a failure rather than an empty list. Reject dismisses a report
 * and leaves the snapshot public; Confirm upholds it and the snapshot leaves the
 * community. Both drop the report from the list.
 */
import { useMemo } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Button, Text } from '@sudobility/components-rn';
import { Spinner } from '@/components/controls/Spinner';
import { flagReasonLabelKey, type SnapshotFlag } from '@sudobility/music_types';
import {
  useReviewFlags,
  type MusicHookContext,
} from '@sudobility/music_client';
import { getMusicClient, getNetworkClient } from '@/config/server';
import { CONSTANTS } from '@/config/constants';
import { readIdToken, useAuth } from '@/auth/AuthContext';
import { ScreenScaffold, ServerUnavailable } from '../ScreenScaffold';
import { usePendingAction } from '@/components/controls/usePendingAction';

export function ReviewFlagsSection() {
  const { user } = useAuth();
  const ctx = useMemo<MusicHookContext | null>(
    () =>
      getMusicClient()
        ? {
            networkClient: getNetworkClient(),
            baseUrl: CONSTANTS.API_URL,
            getToken: readIdToken,
            userId: user?.uid ?? null,
          }
        : null,
    [user?.uid],
  );

  if (!ctx) {
    return (
      <ScreenScaffold>
        <ServerUnavailable />
      </ScreenScaffold>
    );
  }
  return <ReviewFlagsList ctx={ctx} />;
}

function ReviewFlagsList({ ctx }: { ctx: MusicHookContext }) {
  const { t } = useTranslation();
  const { flags, isLoading, error, reject, confirm } = useReviewFlags(ctx);
  // One review action at a time; the control that started it spins, keyed by
  // the flag and the action.
  const pending = usePendingAction<string>();

  return (
    <ScreenScaffold>
      <Text className="text-muted-foreground text-sm">
        {t('flag.reviewHint')}
      </Text>
      {error ? (
        <Text className="text-destructive text-base">
          {t('flag.reviewFailed')}
        </Text>
      ) : isLoading ? (
        <View className="items-center py-3">
          <Spinner />
        </View>
      ) : !flags || flags.length === 0 ? (
        <Text className="text-muted-foreground text-base">
          {t('flag.reviewEmpty')}
        </Text>
      ) : (
        <View className="gap-3">
          {flags.map(flag => (
            <FlagRow
              key={flag.id}
              flag={flag}
              busy={pending.pending}
              rejecting={pending.pendingKey === `reject:${flag.id}`}
              confirming={pending.pendingKey === `confirm:${flag.id}`}
              onReject={() =>
                void pending.run(() => reject(flag.id), `reject:${flag.id}`)
              }
              onConfirm={() =>
                void pending.run(() => confirm(flag.id), `confirm:${flag.id}`)
              }
            />
          ))}
        </View>
      )}
    </ScreenScaffold>
  );
}

function FlagRow({
  flag,
  busy,
  rejecting,
  confirming,
  onReject,
  onConfirm,
}: {
  flag: SnapshotFlag;
  busy: boolean;
  rejecting: boolean;
  confirming: boolean;
  onReject: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  return (
    <View className="border-border gap-2 rounded-md border p-3">
      <View className="flex-row flex-wrap items-center gap-2">
        <Text className="text-foreground flex-1 text-base font-medium">
          {flag.publicName}
        </Text>
        <Text className="bg-muted text-foreground rounded px-2 py-0.5 text-sm">
          {t(flagReasonLabelKey(flag.reason))}
        </Text>
      </View>
      <Text className="text-muted-foreground text-sm">
        {t('community.sharedBy', { name: flag.publisherName })}
      </Text>
      <Text className="text-foreground text-sm">{flag.details}</Text>
      <View className="flex-row gap-2">
        <Button
          variant="ghost"
          disabled={busy}
          loading={rejecting}
          onPress={onReject}
          accessibilityLabel={t('flag.reject')}
        >
          {t('flag.reject')}
        </Button>
        <Button
          variant="destructive"
          disabled={busy}
          loading={confirming}
          onPress={onConfirm}
          accessibilityLabel={t('flag.confirm')}
        >
          {t('flag.confirm')}
        </Button>
      </View>
    </View>
  );
}
