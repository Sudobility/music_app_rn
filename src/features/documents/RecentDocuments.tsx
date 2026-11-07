/**
 * The documents opened lately, offered when nothing is open.
 *
 * Shown only in the empty state: once a score is on screen, a list of other
 * scores is a distraction from the one you came for. Reopening goes through
 * `openFileInto`, so a file already open raises its tab rather than opening a
 * second, divergent copy. Saving adds to the list through the store's
 * `onSaved`, wired at the composition root; reopening refreshes the entry here.
 */
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Button } from '@sudobility/components-rn';
import { openFileInto } from '@/documents/document';
import { forgetRecent, loadRecent } from '@/documents/recent-documents';
import { recordRecent } from '@/documents/useRecentTracking';
import type {
  KeyValueStore,
  RecentDocument,
} from '@/documents/recent-documents';
import {
  useDocumentList,
  useDocumentServices,
} from '@/documents/DocumentsContext';
import { usePendingAction } from '@sudobility/music_ui_rn';

export function RecentDocuments({ keyValue }: { keyValue: KeyValueStore }) {
  const list = useDocumentList();
  const services = useDocumentServices();
  const [recent, setRecent] = useState<RecentDocument[]>([]);
  // Reading a file is a wait: the entry chosen spins, and none opens twice.
  const opening = usePendingAction<string>();

  useEffect(() => {
    void loadRecent(keyValue).then(setRecent);
  }, [keyValue]);

  function open(entry: RecentDocument) {
    return opening.run(async () => {
      try {
        const opened = await openFileInto(list, services, entry.handle);
        recordRecent(keyValue, opened.store.getState());
      } catch {
        // A file that has gone away should leave the list rather than sit
        // there failing every time it is tapped.
        setRecent(await forgetRecent(keyValue, entry.uri));
      }
    }, entry.uri);
  }

  if (recent.length === 0) return null;
  return (
    <View className="mt-5 items-center gap-1">
      {recent.map(entry => (
        // The library's quiet button: the theme's ink (this was a zinc
        // literal, unreadable on a dark background), the minimum touch
        // target, and the assistive press a Mac reaches a control by.
        <Button
          key={entry.uri}
          variant="ghost"
          accessibilityLabel={entry.title}
          disabled={opening.pending}
          loading={opening.pendingKey === entry.uri}
          onPress={() => void open(entry)}
        >
          {entry.title}
        </Button>
      ))}
    </View>
  );
}
