/**
 * A sheet that holds the controls a bar could not fit.
 *
 * Unlike `OverflowMenu`, whose rows just *run* an action, these rows each hold
 * a live control — a toggle, a select, a slider, a field — so the sheet is a
 * small settings panel: the label on the left, the control itself on the right.
 * The playback bar and the editing bar hand it the controls they move off the
 * bar on a phone; on a tablet or desktop they show those controls inline and
 * this is not used.
 */
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { FormModal, Text } from '@sudobility/components-rn';
import { useTranslation } from 'react-i18next';

export type ControlRow = {
  /** Stable key for the row. */
  key: string;
  /** The control's name, already localized. */
  label: string;
  /** The live control — a toggle, select, slider or field. */
  control: ReactNode;
};

export function ControlsSheet({
  open,
  title,
  onClose,
  rows,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  rows: readonly ControlRow[];
}) {
  const { t } = useTranslation();
  return (
    <FormModal
      visible={open}
      title={title}
      onClose={onClose}
      actions={[]}
      closeAriaLabel={t('common.closeDialog')}
    >
      <View className="gap-3 p-1">
        {rows.map(row => (
          <View
            key={row.key}
            className="min-h-11 flex-row items-center justify-between gap-3"
          >
            <Text className="text-foreground text-base">{row.label}</Text>
            <View className="shrink-0 flex-row items-center">
              {row.control}
            </View>
          </View>
        ))}
      </View>
    </FormModal>
  );
}
