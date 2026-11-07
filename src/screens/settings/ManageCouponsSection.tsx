/**
 * Making coupons, and seeing what became of them. Site administrators only.
 *
 * The list is what offers this section (`SettingsScreen` asks `siteAdmin`),
 * and the server is what enforces it: a request from anybody else is refused
 * there, which this shows as a failure rather than as an empty list.
 */
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Button, Input, Text } from '@sudobility/components-rn';
import { Spinner } from '@sudobility/music_ui_rn';
import type { CreditCoupon } from '@sudobility/consumables_client';
import { useAuth } from '@/auth/AuthContext';
import { useConsumablesClient } from '@/features/account/useAccountClients';
import { SelectableText } from '@sudobility/music_ui_rn';
import { ScreenScaffold, ServerUnavailable } from '../ScreenScaffold';
import { usePendingAction } from '@sudobility/music_ui_rn';

/** A calendar date, as the field asks for one. */
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function ManageCouponsSection() {
  const { t } = useTranslation();
  const { getToken } = useAuth();
  const client = useConsumablesClient(getToken);
  const [coupons, setCoupons] = useState<CreditCoupon[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [credits, setCredits] = useState('');
  const [expires, setExpires] = useState('');
  const [email, setEmail] = useState('');
  const creating = usePendingAction();
  const [created, setCreated] = useState<string | null>(null);
  const [createFailed, setCreateFailed] = useState(false);

  const load = useCallback(() => {
    if (!client) return;
    setLoadFailed(false);
    void client
      .listCreditCoupons()
      .then(setCoupons)
      .catch(() => setLoadFailed(true));
  }, [client]);
  useEffect(load, [load]);

  if (!client) {
    return (
      <ScreenScaffold>
        <ServerUnavailable />
      </ScreenScaffold>
    );
  }

  const amount = Number.parseInt(credits, 10);
  const valid =
    Number.isInteger(amount) && amount > 0 && DATE.test(expires.trim());

  const create = () =>
    void creating.run(async () => {
      setCreated(null);
      setCreateFailed(false);
      try {
        const coupon = await client.createCreditCoupon({
          credits: amount,
          // The end of the day named, so a coupon "until the 5th" works on it.
          expires_at: new Date(`${expires.trim()}T23:59:59`).toISOString(),
          email: email.trim() === '' ? null : email.trim(),
        });
        setCreated(coupon.code);
        setCredits('');
        setExpires('');
        setEmail('');
        load();
      } catch {
        setCreateFailed(true);
      }
    });

  return (
    <ScreenScaffold>
      <View className="gap-2">
        <Input
          value={credits}
          onChangeText={setCredits}
          keyboardType="number-pad"
          placeholder={t('nav.credits')}
          accessibilityLabel={t('nav.credits')}
          className="border-border rounded-md border"
        />
        <Input
          value={expires}
          onChangeText={setExpires}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder={t('coupons.expiresPlaceholder')}
          accessibilityLabel={t('coupons.expires')}
          className="border-border rounded-md border"
        />
        <Input
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder={t('coupons.email')}
          accessibilityLabel={t('coupons.email')}
          className="border-border rounded-md border"
        />
        <Text className="text-muted-foreground text-sm">
          {t('coupons.emailHint')}
        </Text>
        <Button
          onPress={create}
          disabled={!valid}
          loading={creating.pending}
          accessibilityLabel={t('coupons.create')}
        >
          {t('coupons.create')}
        </Button>
        {created ? (
          <SelectableText className="text-success text-base">
            {t('coupons.created', { code: created })}
          </SelectableText>
        ) : null}
        {createFailed ? (
          <Text className="text-destructive text-base">
            {t('coupons.createFailed')}
          </Text>
        ) : null}
      </View>

      <View className="gap-1">
        {coupons === null && !loadFailed ? (
          <View className="items-center py-3">
            <Spinner />
          </View>
        ) : null}
        {loadFailed ? (
          <Text className="text-destructive text-base">
            {t('account.loadFailed')}
          </Text>
        ) : null}
        {coupons?.length === 0 ? (
          <Text className="text-muted-foreground text-base">
            {t('coupons.none')}
          </Text>
        ) : null}
        {coupons?.map(coupon => (
          <View
            key={coupon.code}
            className="border-border/50 gap-1 border-b py-2"
          >
            <View className="flex-row items-center justify-between gap-3">
              <SelectableText className="text-foreground flex-1 text-base font-medium">
                {coupon.code}
              </SelectableText>
              <Text className="text-foreground text-base tabular-nums">
                {coupon.credits}
              </Text>
            </View>
            <Text className="text-muted-foreground text-sm">
              {t('coupons.expiresOn', {
                date: new Date(coupon.expiresAt).toLocaleDateString(),
              })}
              {' · '}
              {t('coupons.redeemedCount', { count: coupon.history.length })}
              {coupon.email ? ` · ${coupon.email}` : ''}
            </Text>
          </View>
        ))}
      </View>
    </ScreenScaffold>
  );
}
