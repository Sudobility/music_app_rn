/**
 * The open documents, as tabs.
 *
 * Rendered from `useDocuments`, which re-renders on open, close and activate —
 * never on an edit. Each tab subscribes to its own store for the two things
 * that change without the list changing: the title and whether there is
 * unwritten work. Per tab, and only those two fields, so an edit re-renders the
 * one tab whose dot it flips rather than the bar. They used to be read off a
 * mutable record beside the store, which is how a tab kept showing "clean" for
 * a document that had been edited until something unrelated re-rendered it.
 *
 * **Closing asks first when work would be lost.** `decideClose` is
 * music_lib's, shared with the web app, and reads the store's `dirty` —
 * which music_lib clears only once a write has succeeded *and* the score saved
 * is still the one open, so a save that raced an edit still asks. The question
 * names the document, because a tab bar is exactly where somebody closes the
 * wrong one.
 *
 * Hidden below two documents, because a single tab is a label, not a choice.
 */
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useStore } from 'zustand';
import { useTranslation } from 'react-i18next';
import { XMarkIcon } from 'react-native-heroicons/outline';
import { MIN_TOUCH_TARGET, Text } from '@sudobility/components-rn';
import { IconButton } from '@sudobility/music_ui_rn';
import { useNotationInk } from '@sudobility/music_ui_rn';
import { ConfirmSheet } from '@sudobility/music_ui_rn';
import { useDocumentList, useDocuments } from '@/documents/DocumentsContext';
import type { MusicDocument } from '@/documents/document';
import { decideClose } from '@sudobility/music_lib';

export function DocumentTabs() {
  const { t } = useTranslation();
  const list = useDocumentList();
  const { documents, activeId } = useDocuments();
  const [closing, setClosing] = useState<MusicDocument | null>(null);
  if (documents.length < 2) return null;

  const requestClose = (document: MusicDocument): void => {
    const decision = decideClose(document.store.getState());
    if (decision.kind === 'close') list.close(document.id);
    else setClosing(document);
  };

  return (
    <View className="border-border bg-background border-b">
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {documents.map(document => (
          <DocumentTab
            key={document.id}
            document={document}
            active={document.id === activeId}
            onActivate={() => list.activate(document.id)}
            onClose={() => requestClose(document)}
          />
        ))}
      </ScrollView>
      <ConfirmSheet
        open={closing !== null}
        title={t('document.unsavedTitle')}
        message={t('document.unsavedBody', {
          title: closing?.store.getState().title ?? '',
        })}
        confirmLabel={t('document.closeWithoutSaving')}
        destructive
        onCancel={() => setClosing(null)}
        onConfirm={() => {
          if (closing) list.close(closing.id);
          setClosing(null);
        }}
      />
    </View>
  );
}

function DocumentTab({
  document,
  active,
  onActivate,
  onClose,
}: {
  document: MusicDocument;
  active: boolean;
  onActivate: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const title = useStore(document.store, s => s.title);
  const dirty = useStore(document.store, s => s.dirty);
  const ink = useNotationInk();
  return (
    <Pressable
      accessibilityRole="tab"
      // Named by the document, since the visible text is decorated with the
      // unsaved dot; and pressable by assistive technology, which on macOS
      // reaches a Pressable only through `onAccessibilityTap`. The tab had
      // neither, so a screen reader found its close button and not the tab.
      accessibilityLabel={title}
      accessibilityState={{ selected: active }}
      onAccessibilityTap={onActivate}
      onPress={onActivate}
      // Whole literals, chosen between: a class assembled from parts is never
      // generated. The colours are the theme's — they were zinc and white
      // literals, so the strip stayed a light band across a dark editor.
      className={active ? TAB_ON : TAB}
      style={TAB_SIZE}
    >
      <Text numberOfLines={1} className="text-foreground shrink text-sm">
        {dirty ? `• ${title}` : title}
      </Text>
      <IconButton
        label={t('document.closeDocument', { title })}
        onPress={onClose}
      >
        <XMarkIcon size={CLOSE_SIZE} color={ink.muted} />
      </IconButton>
    </Pressable>
  );
}

const TAB = 'flex-row items-center gap-2 border-b-2 border-transparent px-3';
const TAB_ON =
  'bg-card border-foreground flex-row items-center gap-2 border-b-2 px-3';
/** A tab is a touch target of its own, and no wider than a name needs. */
const TAB_SIZE = { minHeight: MIN_TOUCH_TARGET, maxWidth: 220 } as const;
const CLOSE_SIZE = 16;
