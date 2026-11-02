/**
 * Where credits came from and where they went — the web's credit history.
 *
 * Read straight from `ConsumablesApiClient`, as the balance is: the hooks
 * `consumables_client` offers for this read a store singleton that only a
 * purchase adapter initialises, and this app has none. A page at a time, with
 * more asked for rather than fetched up front.
 *
 * The rows are drawn by `@sudobility/consumables_pages_rn`'s presentational
 * `PurchaseHistoryPage` / `UsageHistoryPage` — the RN mirror of the web's
 * history — so the two platforms render the same ledger. Those components take
 * the rows and the copy; the fetching and pagination stay here, on the API
 * client, which needs no purchase SDK.
 */
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  PurchaseHistoryPage,
  UsageHistoryPage,
} from '@sudobility/consumables_pages_rn';
import type {
  ConsumablePurchaseRecord,
  ConsumableSource,
  ConsumableUsageRecord,
} from '@sudobility/types';
import { useAuth } from '@/auth/AuthContext';
import { useConsumablesClient } from '@/features/account/useAccountClients';
import { ScreenScaffold, ServerUnavailable } from '../ScreenScaffold';

const PAGE = 20;

/** One list that grows by a page: what both halves of the history are. */
function usePages<T>(
  load: ((limit: number, offset: number) => Promise<T[]>) | null,
) {
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [more, setMore] = useState(false);

  const fetchFrom = useCallback(
    (offset: number) => {
      if (!load) return;
      setLoading(true);
      setFailed(false);
      void load(PAGE, offset)
        .then(page => {
          setRows(current => (offset === 0 ? page : [...current, ...page]));
          // A full page is the only sign there may be another.
          setMore(page.length === PAGE);
        })
        .catch(() => setFailed(true))
        .finally(() => setLoading(false));
    },
    [load],
  );

  useEffect(() => fetchFrom(0), [fetchFrom]);
  return { rows, loading, failed, more, fetchFrom };
}

export function CreditHistorySection() {
  const { t } = useTranslation();
  const { getToken } = useAuth();
  const client = useConsumablesClient(getToken);

  const loadPurchases = useCallback(
    (limit: number, offset: number) =>
      client!.getPurchaseHistory(limit, offset),
    [client],
  );
  const loadUsage = useCallback(
    (limit: number, offset: number) => client!.getUsageHistory(limit, offset),
    [client],
  );
  const purchases = usePages<ConsumablePurchaseRecord>(
    client ? loadPurchases : null,
  );
  const usage = usePages<ConsumableUsageRecord>(client ? loadUsage : null);

  if (!client) {
    return (
      <ScreenScaffold>
        <ServerUnavailable />
      </ScreenScaffold>
    );
  }

  // Unknown dates pass through unchanged rather than becoming "Invalid Date".
  const formatDate = (value: string): string => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
  };

  const sources: Record<string, string> = {
    web: t('history.sourceWeb', 'Web'),
    apple: t('history.sourceApple', 'Apple'),
    google: t('history.sourceGoogle', 'Google'),
    free: t('history.sourceFree', 'Free'),
  };

  return (
    <ScreenScaffold>
      <PurchaseHistoryPage
        purchases={purchases.rows}
        isLoading={purchases.loading && purchases.rows.length === 0}
        error={purchases.failed ? t('account.loadFailed') : null}
        onLoadMore={() => purchases.fetchFrom(purchases.rows.length)}
        hasMore={purchases.more}
        labels={{
          title: t('nav.purchases'),
          columnDate: t('history.date', 'Date'),
          columnCredits: t('credits.title', 'Credits'),
          columnSource: t('history.source', 'Source'),
          columnProduct: t('history.package', 'Product'),
          columnAmount: t('history.amount', 'Amount'),
          noRecords: t('history.noPurchases'),
          loadMore: t('history.loadMore'),
        }}
        formatters={{
          formatDate,
          formatAmount: (cents, currency) =>
            new Intl.NumberFormat(undefined, {
              style: 'currency',
              currency,
            }).format(cents / 100),
          formatSource: (source: ConsumableSource) => sources[source] ?? source,
        }}
      />
      <UsageHistoryPage
        usages={usage.rows}
        isLoading={usage.loading && usage.rows.length === 0}
        error={usage.failed ? t('account.loadFailed') : null}
        onLoadMore={() => usage.fetchFrom(usage.rows.length)}
        hasMore={usage.more}
        labels={{
          title: t('history.usage'),
          columnDate: t('history.date', 'Date'),
          columnFilename: t('history.generation'),
          columnCredits: t('credits.title', 'Credits'),
          noRecords: t('history.noUsage'),
          loadMore: t('history.loadMore'),
        }}
        formatters={{ formatDate }}
      />
    </ScreenScaffold>
  );
}
