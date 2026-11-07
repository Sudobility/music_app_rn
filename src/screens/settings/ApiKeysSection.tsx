/**
 * Keys that act for the account's workspace — the web dashboard's API keys.
 *
 * A key belongs to a workspace, and this app has no workspace picker, so the
 * keys shown are the personal workspace's: the one every account has and the
 * one its projects live in. Where an account has none yet, the section says
 * so rather than offering a key with nowhere to belong.
 *
 * **The secret is shown once.** The server keeps a hash of it and cannot
 * produce it again, so it is drawn selectable and stays until it is put away.
 */
import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Button, Text } from '@sudobility/components-rn';
import { Spinner } from '@sudobility/music_ui_rn';
import { FieldRow } from '@sudobility/music_ui_rn';
import { usePendingAction } from '@sudobility/music_ui_rn';
import {
  useCreateApiKey,
  useEntities,
  useEntityApiKeys,
  useRevokeApiKey,
} from '@sudobility/entity_client';
import type {
  CreatedEntityApiKey,
  EntityClient,
} from '@sudobility/entity_client';
import { useAuth } from '@/auth/AuthContext';
import { useEntityClient } from '@/features/account/useAccountClients';
import { SelectableText } from '@sudobility/music_ui_rn';
import { ScreenScaffold, ServerUnavailable } from '../ScreenScaffold';

export function ApiKeysSection() {
  const { getToken } = useAuth();
  const client = useEntityClient(getToken);
  if (!client) {
    return (
      <ScreenScaffold>
        <ServerUnavailable />
      </ScreenScaffold>
    );
  }
  return <Keys client={client} />;
}

function Keys({ client }: { client: EntityClient }) {
  const { t } = useTranslation();
  const entities = useEntities(client);
  const workspace =
    entities.data?.find(entity => entity.entityType === 'personal') ??
    entities.data?.[0] ??
    null;
  const slug = workspace?.entitySlug ?? null;
  const keys = useEntityApiKeys(client, slug);
  const create = useCreateApiKey(client);
  const revoke = useRevokeApiKey(client);
  const [name, setName] = useState('');
  const [revealed, setRevealed] = useState<CreatedEntityApiKey | null>(null);
  const [failed, setFailed] = useState(false);
  const creating = usePendingAction();
  const revoking = usePendingAction<string>();

  if (entities.isLoading) {
    return (
      <ScreenScaffold>
        <View className="items-center py-8">
          <Spinner />
        </View>
      </ScreenScaffold>
    );
  }
  if (!slug) {
    return (
      <ScreenScaffold>
        <Text className="text-muted-foreground text-base">
          {t('apiKeys.unavailable')}
        </Text>
      </ScreenScaffold>
    );
  }

  const submit = () =>
    void creating.run(async () => {
      setFailed(false);
      try {
        const key = await create.mutateAsync({
          entitySlug: slug,
          request: { key_name: name.trim() },
        });
        setRevealed(key);
        setName('');
      } catch {
        setFailed(true);
      }
    });

  return (
    <ScreenScaffold>
      <Text className="text-muted-foreground text-base">
        {t('apiKeys.intro')}
      </Text>

      {revealed ? (
        <View className="border-warning bg-warning/10 gap-2 rounded-md border p-3">
          <Text className="text-foreground text-base font-medium">
            {t('apiKeys.newKey', { name: revealed.keyName })}
          </Text>
          <Text className="text-foreground text-sm">
            {t('apiKeys.copyNow')}
          </Text>
          <SelectableText className="text-foreground text-base">
            {revealed.key}
          </SelectableText>
          <Button
            size="sm"
            variant="outline"
            onPress={() => setRevealed(null)}
            accessibilityLabel={t('apiKeys.hide')}
          >
            {t('apiKeys.hide')}
          </Button>
        </View>
      ) : null}

      <FieldRow
        label={t('apiKeys.name')}
        value={name}
        onChangeText={setName}
        action={t('apiKeys.create')}
        onAction={submit}
        actionDisabled={name.trim() === ''}
        actionLoading={creating.pending}
        input={{ maxLength: 100 }}
      />

      {failed || keys.error ? (
        <Text className="text-destructive text-base">
          {t('apiKeys.failed')}
        </Text>
      ) : null}

      <View className="gap-1">
        {keys.isLoading ? (
          <View className="items-center py-3">
            <Spinner />
          </View>
        ) : null}
        {keys.data?.length === 0 ? (
          <Text className="text-muted-foreground text-base">
            {t('apiKeys.none')}
          </Text>
        ) : null}
        {keys.data?.map(key => (
          <View
            key={key.id}
            className="border-border/50 flex-row items-center justify-between gap-3 border-b py-2"
          >
            <View className="flex-1">
              <Text className="text-foreground text-base font-medium">
                {key.keyName}
              </Text>
              <Text className="text-muted-foreground text-sm">
                {key.keyPrefix}
                {'… · '}
                {key.isActive ? t('apiKeys.active') : t('apiKeys.revoked')}
                {' · '}
                {key.lastUsedAt
                  ? t('apiKeys.lastUsed', {
                      date: new Date(key.lastUsedAt).toLocaleDateString(),
                    })
                  : t('apiKeys.neverUsed')}
              </Text>
            </View>
            {key.isActive ? (
              <Button
                size="sm"
                variant="outline"
                disabled={revoking.pending}
                loading={revoking.pendingKey === key.id}
                onPress={() =>
                  void revoking.run(async () => {
                    setFailed(false);
                    try {
                      await revoke.mutateAsync({
                        entitySlug: slug,
                        keyId: key.id,
                      });
                    } catch {
                      setFailed(true);
                    }
                  }, key.id)
                }
                accessibilityLabel={t('apiKeys.revokeNamed', {
                  name: key.keyName,
                })}
              >
                {t('apiKeys.revoke')}
              </Button>
            ) : null}
          </View>
        ))}
      </View>
    </ScreenScaffold>
  );
}
