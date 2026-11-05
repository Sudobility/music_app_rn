/**
 * The Projects split view's Open pane: the documents already open in the
 * editor, and the way back to each.
 *
 * Under a tab bar the editor is a screen pushed above the tabs, so leaving it
 * leaves its documents behind it — still open, still holding whatever was
 * written, and with nothing pointing at them. A document that came from a
 * project could be found again under My Projects; one that was never saved
 * could not be found at all. The same list the editor's own tab strip draws
 * (`DocumentTabs`), which shows nothing below two documents and is not on
 * screen here in any case.
 */
import { FlatList } from 'react-native';
import { useStore } from 'zustand';
import { useTranslation } from 'react-i18next';
import { Text } from '@sudobility/components-rn';
import { PressableCard } from '@/components/controls/PressableCard';
import { useDocuments } from '@/documents/DocumentsContext';
import type { MusicDocument } from '@/documents/document';
import { useDetailScroll } from '@/components/layout/detail-safe-area';

export type OpenDocumentsPaneProps = {
  onOpen: (document: MusicDocument) => void;
};

export function OpenDocumentsPane({ onOpen }: OpenDocumentsPaneProps) {
  const { t } = useTranslation();
  const { documents } = useDocuments();
  // Vertically scrollable: full-bleed with a scroll inset and safe-area sides.
  const detail = useDetailScroll({ gap: 8 });

  return (
    <FlatList
      {...detail}
      data={documents}
      keyExtractor={(document: MusicDocument) => document.id}
      accessibilityLabel={t('dashboard.openDocuments')}
      renderItem={({ item }: { item: MusicDocument }) => (
        <OpenDocumentRow document={item} onOpen={() => onOpen(item)} />
      )}
    />
  );
}

function OpenDocumentRow({
  document,
  onOpen,
}: {
  document: MusicDocument;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  // Off the document's own store, as the tab strip reads them: neither
  // changes the list, so the list would not re-render for either.
  const title = useStore(document.store, s => s.title);
  const saveState = useStore(document.store, s => s.saveState);
  return (
    <PressableCard label={title} onPress={onOpen}>
      <Text className="text-foreground font-medium">{title}</Text>
      {saveState === 'unsaved' ? (
        <Text className="text-destructive text-sm">{t('editor.unsaved')}</Text>
      ) : null}
    </PressableCard>
  );
}
