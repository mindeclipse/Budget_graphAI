import { QueryClient } from "@tanstack/react-query";
import { SubscriptionRadarResult } from "@/lib/subscription-radar";
import { FINANCE_KEYS, CyclesResponse } from "./keys";

export function createFinanceInvalidations(queryClient: QueryClient) {
  const invalidateTransactions = () => {
    queryClient.invalidateQueries({ queryKey: ["transactions"] });
  };

  const invalidateInvestmentTransactions = () => {
    queryClient.invalidateQueries({
      queryKey: FINANCE_KEYS.investmentTransactions,
    });
  };

  const invalidateRecurring = () => {
    queryClient.invalidateQueries({ queryKey: FINANCE_KEYS.recurring });
    queryClient.invalidateQueries({ queryKey: FINANCE_KEYS.radar });
  };

  const invalidateRadar = () => {
    queryClient.invalidateQueries({ queryKey: FINANCE_KEYS.radar });
  };

  const invalidateCycles = () => {
    queryClient.invalidateQueries({ queryKey: FINANCE_KEYS.cycles });
  };

  const invalidateWealth = () => {
    queryClient.invalidateQueries({ queryKey: FINANCE_KEYS.wealthSummary });
  };

  return {
    invalidateTransactions,
    invalidateInvestmentTransactions,
    invalidateRecurring,
    invalidateRadar,
    invalidateCycles,
    invalidateWealth,
  };
}

export function createOptimisticFinanceMutators(queryClient: QueryClient) {
  const updateActiveCycleLimitOptimistic = (newLimit: number) => {
    queryClient.setQueryData(
      FINANCE_KEYS.cycles,
      (old: CyclesResponse | undefined) => {
        if (!old) return old;
        return {
          ...old,
          activeCycle: old.activeCycle
            ? { ...old.activeCycle, budget_limit: newLimit }
            : null,
          cycles: old.cycles.map((c) =>
            c.id === old.activeCycle?.id ? { ...c, budget_limit: newLimit } : c
          ),
        };
      }
    );
  };

  const updateCategoryBudgetOptimistic = (
    categoryName: string,
    limit: number
  ) => {
    queryClient.setQueryData(FINANCE_KEYS.wealthSummary, (old: any) => {
      if (!old) return old;
      return {
        ...old,
        categoryBudgets: {
          ...(old.categoryBudgets || {}),
          [categoryName]: limit,
        },
      };
    });
  };

  const deleteCategoryBudgetOptimistic = (categoryName: string) => {
    queryClient.setQueryData(FINANCE_KEYS.wealthSummary, (old: any) => {
      if (!old) return old;
      const copy = { ...(old.categoryBudgets || {}) };
      delete copy[categoryName];
      return {
        ...old,
        categoryBudgets: copy,
      };
    });
  };

  const markRecurringPaidOptimistic = (itemId: number, paidAmount: number) => {
    queryClient.setQueryData(
      FINANCE_KEYS.radar,
      (old: SubscriptionRadarResult | undefined) => {
        if (!old) return old;
        const updatedUpcoming = (old.upcoming || []).map((u) => {
          if (u.id === itemId) {
            return {
              ...u,
              status: "paid" as const,
              days_remaining: 0,
              paid_at: new Date().toISOString(),
              paid_amount: paidAmount,
            };
          }
          return u;
        });

        const statusOrder: Record<string, number> = {
          due_today: 0,
          upcoming: 1,
          overdue: 2,
          paid: 3,
        };
        updatedUpcoming.sort((a, b) => {
          const orderA = statusOrder[a.status] ?? 1;
          const orderB = statusOrder[b.status] ?? 1;
          if (orderA !== orderB) {
            return orderA - orderB;
          }
          return a.day_of_month - b.day_of_month;
        });

        return {
          ...old,
          upcoming: updatedUpcoming,
          metrics: {
            ...old.metrics,
            paid_this_month: (old.metrics?.paid_this_month || 0) + paidAmount,
            remaining_this_month: Math.max(
              0,
              (old.metrics?.remaining_this_month || 0) - paidAmount
            ),
          },
        };
      }
    );
  };

  return {
    updateActiveCycleLimitOptimistic,
    updateCategoryBudgetOptimistic,
    deleteCategoryBudgetOptimistic,
    markRecurringPaidOptimistic,
  };
}
