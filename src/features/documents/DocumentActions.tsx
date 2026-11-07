/**
 * New, Save, and what to do when a save fails.
 *
 * New builds a store with the app's document services and Save writes through
 * the document's own store (`saveNow`), so both behave exactly as the File
 * menu's do. A failure is shown rather than swallowed: a save that silently did
 * nothing is how work is lost.
 */
import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Button, Text } from '@sudobility/components-rn';
import { newProjectScore } from '@sudobility/music_lib';
import { exportDocument } from '@/documents/export';
import type { ExportFormat } from '@/documents/export';
import { getAppServices } from '@/config/initialize';
import {
  useDocumentList,
  useDocumentServices,
} from '@/documents/DocumentsContext';
import { newDocument } from '@/documents/document';
import type { MusicDocument } from '@/documents/document';
import { WRITABLE_EXPORT_FORMATS } from '@sudobility/music_types';
import { usePendingAction } from '@sudobility/music_ui_rn';

export function DocumentActions({
  document,
}: {
  document: MusicDocument | null;
}) {
  const { t } = useTranslation();
  const list = useDocumentList();
  const services = useDocumentServices();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!document || saving) return;
    setSaving(true);
    setError(null);
    try {
      await document.store.getState().saveNow();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  // One export at a time; the format being written spins.
  const exporting = usePendingAction<ExportFormat>();
  function exportAs(format: ExportFormat) {
    if (!document) return Promise.resolve(undefined);
    return exporting.run(async () => {
      setError(null);
      try {
        await exportDocument(document, getAppServices().io, format);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    }, format);
  }

  function create() {
    const title = t('document.untitled');
    list.open(newDocument(services, { score: newProjectScore(title), title }));
  }

  /*
    The library's `Button`, which brings what these used to restate by hand:
    the theme's surface and ink (they were zinc literals, so the row stayed
    light in dark mode), the minimum touch target, the pressed answer, and
    `onAccessibilityTap` withheld while disabled.
  */
  return (
    <View className="flex-row items-center gap-2 px-3 py-2">
      <Button
        variant="secondary"
        accessibilityLabel={t('document.new')}
        onPress={create}
      >
        {t('document.new')}
      </Button>
      <Button
        variant="secondary"
        accessibilityLabel={t('editor.save')}
        disabled={!document}
        loading={saving}
        onPress={() => void save()}
      >
        {t('editor.save')}
      </Button>
      {/* music_types' format list, the one the export sheet and the web's
          menu read, so this row cannot offer a different set. */}
      {WRITABLE_EXPORT_FORMATS.map(({ id: format, labelKey }) => (
        <Button
          key={format}
          variant="secondary"
          accessibilityLabel={t('document.exportAs', { format: t(labelKey) })}
          disabled={!document || exporting.pending}
          loading={exporting.pendingKey === format}
          onPress={() => void exportAs(format)}
        >
          {t(labelKey)}
        </Button>
      ))}
      {error ? (
        <Text
          className="text-destructive flex-shrink text-sm"
          numberOfLines={1}
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
}
