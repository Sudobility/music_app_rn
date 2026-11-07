/**
 * Adding credits with a coupon: a form, drawn on the Credits screen under the
 * balance it changes.
 *
 * The one way to get credits in this app: buying them needs a store SDK it
 * does not carry, and a coupon needs a code and a request. It was a section
 * of its own in Settings, a row away from the balance; it is the same
 * question as the balance — how many, and how do I get more — so it is
 * answered in the same place.
 *
 * It draws nothing where there is no server: the screen that holds it has
 * already said so, once.
 */
import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '@sudobility/components-rn';
import { FieldRow } from '@sudobility/music_ui_rn';
import { useAuth } from '@/auth/AuthContext';
import { useConsumablesClient } from '@/features/account/useAccountClients';
import { usePendingAction } from '@sudobility/music_ui_rn';

export function RedeemCouponForm({
  onRedeemed,
}: {
  /** The balance has changed; whoever shows it should ask again. */
  onRedeemed?: () => void;
}) {
  const { t } = useTranslation();
  const { getToken } = useAuth();
  const client = useConsumablesClient(getToken);
  const [code, setCode] = useState('');
  const redeeming = usePendingAction();
  const [done, setDone] = useState<{ credits: number; balance: number } | null>(
    null,
  );
  const [failed, setFailed] = useState(false);

  if (!client) return null;

  const redeem = () =>
    void redeeming.run(async () => {
      setDone(null);
      setFailed(false);
      try {
        const result = await client.redeemCreditCoupon(code.trim());
        setDone(result);
        setCode('');
        onRedeemed?.();
      } catch {
        setFailed(true);
      }
    });

  return (
    <View className="border-border gap-3 border-t pt-4">
      <View className="gap-2">
        <Text className="text-foreground text-base font-medium">
          {t('dashboard.redeemCoupon')}
        </Text>
        <FieldRow
          label={t('coupons.code')}
          value={code}
          onChangeText={setCode}
          action={t('coupons.redeem')}
          onAction={redeem}
          actionDisabled={code.trim() === ''}
          actionLoading={redeeming.pending}
          input={{ autoCapitalize: 'characters', autoCorrect: false }}
        />
      </View>
      {done ? (
        <Text className="text-success text-base">
          {t('coupons.redeemed', {
            credits: done.credits,
            balance: done.balance,
          })}
        </Text>
      ) : null}
      {failed ? (
        <Text className="text-destructive text-base">
          {t('coupons.redeemFailed')}
        </Text>
      ) : null}
    </View>
  );
}
