/**
 * An overflow "…" button that gathers secondary actions into a sheet.
 *
 * On a phone the bars hold more full-size controls (the minimum touch target)
 * than fit a row, so the ones that are not the primary few are moved behind
 * this menu — the editing bar, the playback bar and the editor's title bar each
 * pass it their overflow. On a tablet or desktop there is room for every
 * control, so the bars show them all and this is not used.
 *
 * The sheet is `FormModal` with one `Button` per action, the same shape the
 * long-press `ScoreActionsSheet` uses: a row that names the action and runs it.
 */
import { useState } from 'react';
import { View } from 'react-native';
import { Button, FormModal } from '@sudobility/components-rn';
import { useTranslation } from 'react-i18next';
import { EllipsisHorizontalIcon } from 'react-native-heroicons/outline';
import { IconButton } from '@/components/layout/IconButton';
import { useNotationInk } from '@/components/icons/notation-ink';

export type OverflowAction = {
  /** Stable key for the row. */
  key: string;
  /** The action's name, already localized. */
  label: string;
  onPress: () => void;
  /** Offered but unavailable — shown greyed rather than dropped. */
  disabled?: boolean;
};

export function OverflowMenu({
  actions,
  tint,
  title,
}: {
  actions: readonly OverflowAction[];
  /** The "…" glyph's colour; `foreground` unless on a coloured bar. */
  tint?: string;
  /** The sheet's heading; defaults to "More actions". */
  title?: string;
}) {
  const { t } = useTranslation();
  const ink = useNotationInk();
  const [open, setOpen] = useState(false);
  if (actions.length === 0) return null;
  const heading = title ?? t('editor.moreActions');
  return (
    <>
      <IconButton label={heading} onPress={() => setOpen(true)}>
        <EllipsisHorizontalIcon size={18} color={tint ?? ink.foreground} />
      </IconButton>
      <FormModal
        visible={open}
        title={heading}
        onClose={() => setOpen(false)}
        actions={[]}
        closeAriaLabel={t('common.closeDialog')}
      >
        <View className="gap-2 p-1">
          {actions.map(action => (
            <Button
              key={action.key}
              variant="secondary"
              disabled={action.disabled}
              onPress={() => {
                setOpen(false);
                action.onPress();
              }}
              accessibilityLabel={action.label}
            >
              {action.label}
            </Button>
          ))}
        </View>
      </FormModal>
    </>
  );
}
