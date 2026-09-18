import { useQueryClient } from "@tanstack/react-query";
import { DateRangeFilter } from "./keys";
import {
  useTransactionsQuery,
  useInvestmentTransactionsQuery,
  useRecurringQuery,
  useRadarQuery,
  useCyclesQuery,
  useWealthSummaryQuery,
} from "./useCoreQueries";
import {
  createFinanceInvalidations,
  createOptimisticFinanceMutators,
} from "./useOptimisticFinanceUpdates";

export * from "./keys";
export * from "./useAnalyticsQueries";
export * from "./useCoreQueries";
export * from "./useOptimisticFinanceUpdates";

export function useFinanceQueries(
  isAuthenticated: boolean | null,
  dateRange?: DateRangeFilter
) {
  const queryClient = useQueryClient();

  const transactionsQuery = useTransactionsQuery(isAuthenticated, dateRange);
  const investmentTransactionsQuery =
    useInvestmentTransactionsQuery(isAuthenticated);
  const recurringQuery = useRecurringQuery(isAuthenticated);
  const radarQuery = useRadarQuery(isAuthenticated);
  const cyclesQuery = useCyclesQuery(isAuthenticated);
  const wealthQuery = useWealthSummaryQuery(isAuthenticated);

  const invalidations = createFinanceInvalidations(queryClient);
  const optimisticMutators = createOptimisticFinanceMutators(queryClient);

  return {
    transactions: transactionsQuery.data || [],
    isLoadingTransactions: transactionsQuery.isLoading,
    investmentTransactions: investmentTransactionsQuery.data || [],
    isLoadingInvestmentTransactions: investmentTransactionsQuery.isLoading,
    recurring: recurringQuery.data || [],
    isLoadingRecurring: recurringQuery.isLoading,
    pacing: undefined,
    isLoadingPacing: false,
    radar: radarQuery.data,
    isLoadingRadar: radarQuery.isLoading,
    cycles: cyclesQuery.data?.cycles || [],
    activeCycle: cyclesQuery.data?.activeCycle || null,
    isLoadingCycles: cyclesQuery.isLoading,
    wealthData: wealthQuery.data,
    isLoadingWealth: wealthQuery.isLoading,
    ...invalidations,
    ...optimisticMutators,
  };
}
