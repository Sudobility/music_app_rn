/**
 * Turning the open local document into a project.
 *
 * A project and a file are two origins for the same document, so this changes
 * where the bytes go and nothing else: the identity, the undo history and the
 * tab all survive. That is why it swaps the origin rather than creating a
 * second document — the alternative leaves two copies of one score, and the
 * next edit picks one of them at random.
 *
 * Offered only for a document that is not already a project, and only when
 * there is a server and an account to put it on. A control that is present and
 * refuses is worse than one that is absent.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Text } from '@sudobility/components-rn';
import { View } from 'react-native';
import { useStore } from 'zustand';
import type { DocumentStore } from '@sudobility/music_lib';
import { getMusicClient } from '@/config/server';
import { useAuth } from '@/auth/AuthContext';
import { useActiveDocument } from '@/documents/DocumentsContext';
import { usePendingAction } from '@sudobility/music_ui_rn';

export function SyncToServerButton() {
  const document = useActiveDocument();
  const { user } = useAuth();
  if (!getMusicClient() || !user || !document) return null;
  return <SyncDocument store={document.store} />;
}

/**
 * The button itself, over one store.
 *
 * `syncToServer` is the store's (music_lib): it creates the project, moves the
 * origin, records the server's version and leaves the document clean only if
 * nothing was edited while the project was being made — otherwise the pending
 * save carries that edit to the project. The copy this replaced cleared the
 * dirty flag regardless, marking an edit made mid-sync as saved.
 */
function SyncDocument({ store }: { store: DocumentStore }) {
  const { t } = useTranslation();
  const origin = useStore(store, s => s.origin);
  const serverAvailable = useStore(store, s => s.serverAvailable);
  const syncing = usePendingAction();
  const [error, setError] = useState<string | null>(null);

  if (!serverAvailable || origin.kind === 'project') return null;

  return (
    <View className="gap-1">
      <Button
        variant="secondary"
        loading={syncing.pending}
        onPress={() =>
          void syncing.run(async () => {
            setError(null);
            try {
              await store.getState().syncToServer();
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
            }
          })
        }
      >
        {t('dashboard.syncToServer')}
      </Button>
      {error ? <Text className="text-destructive text-sm">{error}</Text> : null}
    </View>
  );
}
