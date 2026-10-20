/**
 * Report a shared snapshot.
 *
 * A reason (copyright, offensive, other) and a required explanation, sent to the
 * site-admin review queue. The shape is `GenerateTrackSheet`'s: a `FormModal`
 * with a `Select` and a multiline `Input`, the submit spinning while the request
 * is in flight. Flagging requires sign-in, which the caller handles before
 * opening this.
 */
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { FormModal, Input, Select, Text } from '@sudobility/components-rn';
import {
  FLAG_REASONS,
  flagReasonLabelKey,
  type FlagReason,
} from '@sudobility/music_types';

export type FlagSnapshotSheetProps = {
  open: boolean;
  onClose: () => void;
  onSubmit: (reason: FlagReason, details: string) => void;
  /** The report is being sent: Submit spins and the sheet stays up until it lands. */
  submitting?: boolean;
};

function ignore(): void {}

export function FlagSnapshotSheet({
  open,
  onClose,
  onSubmit,
  submitting = false,
}: FlagSnapshotSheetProps) {
  const { t } = useTranslation();
  const [reason, setReason] = useState<FlagReason>(FLAG_REASONS[0]);
  const [details, setDetails] = useState('');

  useEffect(() => {
    if (open) {
      setReason(FLAG_REASONS[0]);
      setDetails('');
    }
  }, [open]);

  const trimmed = details.trim();

  return (
    <FormModal
      visible={open}
      title={t('flag.title')}
      onClose={submitting ? ignore : onClose}
      saving={submitting}
      closeAriaLabel={t('common.closeDialog')}
      actions={[
        {
          label: t('common.cancel'),
          onPress: onClose,
          variant: 'ghost',
          disabled: submitting,
        },
        {
          label: t('flag.submit'),
          disabled: trimmed === '',
          loading: submitting,
          onPress: () => onSubmit(reason, trimmed),
        },
      ]}
    >
      <>
        <Text className="text-muted-foreground pb-3 text-base">
          {t('flag.hint')}
        </Text>

        <View className="gap-1 pb-3">
          <Text className="text-muted-foreground text-sm">
            {t('flag.reasonLabel')}
          </Text>
          <Select
            value={reason}
            accessibilityLabel={t('flag.reasonLabel')}
            options={FLAG_REASONS.map(r => ({
              value: r,
              label: t(flagReasonLabelKey(r)),
            }))}
            onValueChange={value => setReason(value as FlagReason)}
          />
        </View>

        <View className="gap-1">
          <Text className="text-muted-foreground text-sm">
            {t('flag.detailsLabel')}
          </Text>
          <Input
            value={details}
            onChangeText={setDetails}
            multiline
            numberOfLines={3}
            placeholder={t('flag.detailsPlaceholder')}
            accessibilityLabel={t('flag.detailsLabel')}
          />
        </View>
      </>
    </FormModal>
  );
}
