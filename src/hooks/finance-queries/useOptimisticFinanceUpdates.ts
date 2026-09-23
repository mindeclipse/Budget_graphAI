import { QueryClient } from "@tanstack/react-query";
import { SubscriptionRadarResult } from "@/lib/subscription-radar";
import {
  SavingsGoal,
  InvestmentAsset,
  WishlistItem,
  CostPerUseItem,
  RecurringItem,
  BudgetCycle,
} from "@/types/finance";
import { FINANCE_KEYS, CyclesResponse } from "./keys";

export function createFinanceInvalidations(queryClient: QueryClient) {
  const invalidateTransactions = () => {
    return queryClient.invalidateQueries({
      queryKey: ["transactions"],
      refetchType: "all",
    });
  };

  const invalidateInvestmentTransactions = () => {
    return queryClient.invalidateQueries({
      queryKey: FINANCE_KEYS.investmentTransactions,
      refetchType: "all",
    });
  };

  const invalidateRecurring = () => {
    return Promise.all([
      queryClient.invalidateQueries({
        queryKey: FINANCE_KEYS.recurring,
        refetchType: "all",
      }),
      queryClient.invalidateQueries({
        queryKey: FINANCE_KEYS.radar,
        refetchType: "all",
      }),
    ]);
  };

  const invalidateRadar = () => {
    return queryClient.invalidateQueries({
      queryKey: FINANCE_KEYS.radar,
      refetchType: "all",
    });
  };

  const invalidateCycles = () => {
    return queryClient.invalidateQueries({
      queryKey: FINANCE_KEYS.cycles,
      refetchType: "all",
    });
  };

  const invalidateWealth = () => {
    return queryClient.invalidateQueries({
      queryKey: FINANCE_KEYS.wealthSummary,
      refetchType: "all",
    });
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
  // --- CYCLES ---
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

  const createCycleOptimistic = (cycleData: {
    name: string;
    budget_limit: number;
    start_date: string;
  }) => {
    const newCycle: BudgetCycle = {
      id: `temp-${Date.now()}`,
      name: cycleData.name,
      budget_limit: cycleData.budget_limit,
      start_date: cycleData.start_date,
      is_active: true,
      created_at: new Date().toISOString(),
    };

    queryClient.setQueryData(
      FINANCE_KEYS.cycles,
      (old: CyclesResponse | undefined) => {
        if (!old) {
          return { activeCycle: newCycle, cycles: [newCycle] };
        }
        const updatedExisting = old.cycles.map((c) => ({
          ...c,
          is_active: false,
        }));
        return {
          activeCycle: newCycle,
          cycles: [newCycle, ...updatedExisting],
        };
      }
    );
  };

  // --- CATEGORY BUDGETS ---
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

  // --- SAVINGS GOALS ---
  const depositSavingsGoalOptimistic = (goalId: number, amount: number) => {
    queryClient.setQueryData(FINANCE_KEYS.wealthSummary, (old: any) => {
      if (!old || !Array.isArray(old.goals)) return old;
      return {
        ...old,
        goals: old.goals.map((g: SavingsGoal) =>
          g.id === goalId
            ? { ...g, current_amount: Number(g.current_amount || 0) + amount }
            : g
        ),
      };
    });
  };

  const upsertSavingsGoalOptimistic = (
    goal: Partial<SavingsGoal> & {
      name: string;
      current_amount: number;
      currency: string;
    }
  ) => {
    queryClient.setQueryData(FINANCE_KEYS.wealthSummary, (old: any) => {
      if (!old) return old;
      const goals = Array.isArray(old.goals) ? [...old.goals] : [];
      if (goal.id && goal.id > 0) {
        return {
          ...old,
          goals: goals.map((g: SavingsGoal) =>
            g.id === goal.id ? { ...g, ...goal } : g
          ),
        };
      }
      const newGoal: SavingsGoal = {
        id: -Date.now(),
        name: goal.name,
        current_amount: goal.current_amount,
        target_amount: goal.target_amount ?? null,
        currency: goal.currency,
        target_date: goal.target_date ?? null,
        created_at: new Date().toISOString(),
      };
      return {
        ...old,
        goals: [...goals, newGoal],
      };
    });
  };

  const deleteSavingsGoalOptimistic = (goalId: number) => {
    queryClient.setQueryData(FINANCE_KEYS.wealthSummary, (old: any) => {
      if (!old || !Array.isArray(old.goals)) return old;
      return {
        ...old,
        goals: old.goals.filter((g: SavingsGoal) => g.id !== goalId),
      };
    });
  };

  // --- INVESTMENTS ---
  const upsertInvestmentOptimistic = (
    asset: Partial<InvestmentAsset> & {
      asset_name: string;
      current_value: number;
      invested_amount: number;
      currency: string;
      asset_type: any;
    }
  ) => {
    queryClient.setQueryData(FINANCE_KEYS.wealthSummary, (old: any) => {
      if (!old) return old;
      const investments = Array.isArray(old.investments)
        ? [...old.investments]
        : [];
      if (asset.id && asset.id > 0) {
        return {
          ...old,
          investments: investments.map((a: InvestmentAsset) =>
            a.id === asset.id ? { ...a, ...asset } : a
          ),
        };
      }
      const newAsset: InvestmentAsset = {
        id: -Date.now(),
        asset_name: asset.asset_name,
        asset_type: asset.asset_type,
        invested_amount: asset.invested_amount,
        current_value: asset.current_value,
        currency: asset.currency,
        yield_percent: asset.yield_percent ?? null,
        maturity_date: asset.maturity_date ?? null,
        notes: asset.notes ?? null,
        coupons: asset.coupons ?? [],
        quantity: asset.quantity ?? null,
        coupon_amount: asset.coupon_amount ?? null,
        is_archived: asset.is_archived ?? false,
        created_at: new Date().toISOString(),
      };
      return {
        ...old,
        investments: [...investments, newAsset],
      };
    });
  };

  const deleteInvestmentOptimistic = (assetId: number) => {
    queryClient.setQueryData(FINANCE_KEYS.wealthSummary, (old: any) => {
      if (!old || !Array.isArray(old.investments)) return old;
      return {
        ...old,
        investments: old.investments.filter(
          (a: InvestmentAsset) => a.id !== assetId
        ),
      };
    });
  };

  // --- WISHLIST ---
  const addWishlistOptimistic = (
    item: Partial<WishlistItem> & {
      title: string;
      estimated_price: number;
      currency: string;
      category_name: string;
      cooling_days: number;
    }
  ) => {
    queryClient.setQueryData(FINANCE_KEYS.wealthSummary, (old: any) => {
      if (!old) return old;
      const existingItems = old.wishlist?.items || [];
      const newWish: WishlistItem = {
        id: -Date.now(),
        title: item.title,
        estimated_price: item.estimated_price,
        currency: item.currency,
        category_name: item.category_name,
        url: item.url || null,
        notes: item.notes || null,
        cooling_days: item.cooling_days,
        cooling_end_date: new Date(
          Date.now() + item.cooling_days * 86400000
        ).toISOString(),
        status: "cooling",
        created_at: new Date().toISOString(),
      };

      const metrics = old.wishlist?.metrics || {};
      return {
        ...old,
        wishlist: {
          ...old.wishlist,
          items: [newWish, ...existingItems],
          metrics: {
            ...metrics,
            cooling_count: (metrics.cooling_count || 0) + 1,
            pending_amount:
              (metrics.pending_amount || 0) + item.estimated_price,
          },
        },
      };
    });
  };

  const resolveWishlistOptimistic = (
    id: number,
    status: "saved" | "purchased"
  ) => {
    queryClient.setQueryData(FINANCE_KEYS.wealthSummary, (old: any) => {
      if (!old || !old.wishlist?.items) return old;
      const items = old.wishlist.items.map((it: WishlistItem) =>
        it.id === id
          ? { ...it, status, resolved_at: new Date().toISOString() }
          : it
      );
      const target = old.wishlist.items.find(
        (it: WishlistItem) => it.id === id
      );
      const metrics = { ...(old.wishlist.metrics || {}) };
      if (target && status === "saved") {
        metrics.saved_amount =
          (metrics.saved_amount || 0) + Number(target.estimated_price || 0);
      }
      if (target && target.status === "cooling") {
        metrics.cooling_count = Math.max(0, (metrics.cooling_count || 0) - 1);
      } else if (target && target.status === "ready") {
        metrics.ready_count = Math.max(0, (metrics.ready_count || 0) - 1);
      }

      return {
        ...old,
        wishlist: {
          ...old.wishlist,
          items,
          metrics,
        },
      };
    });
  };

  const deleteWishlistOptimistic = (id: number) => {
    queryClient.setQueryData(FINANCE_KEYS.wealthSummary, (old: any) => {
      if (!old || !old.wishlist?.items) return old;
      return {
        ...old,
        wishlist: {
          ...old.wishlist,
          items: old.wishlist.items.filter((it: WishlistItem) => it.id !== id),
        },
      };
    });
  };

  // --- COST PER USE ---
  const addCostPerUseOptimistic = (
    item: Partial<CostPerUseItem> & {
      item_name: string;
      purchase_price: number;
      currency: string;
      category_name: string;
      total_uses?: number;
      benchmark_cost_per_use?: number | null;
      target_cost_per_use?: number | null;
    }
  ) => {
    queryClient.setQueryData(FINANCE_KEYS.wealthSummary, (old: any) => {
      if (!old) return old;
      const existingItems = old.costPerUse?.items || [];
      const uses = Math.max(1, item.total_uses || 1);
      const currentCost = Math.round((item.purchase_price / uses) * 100) / 100;
      let moneySaved = 0;
      let roiPercent = 0;
      if (item.benchmark_cost_per_use && item.benchmark_cost_per_use > 0) {
        const totalBenchmark = item.benchmark_cost_per_use * uses;
        moneySaved = Math.max(0, totalBenchmark - item.purchase_price);
        roiPercent = Math.round((totalBenchmark / item.purchase_price) * 100);
      }

      const newCpu: CostPerUseItem = {
        id: -Date.now(),
        item_name: item.item_name,
        category_name: item.category_name,
        purchase_price: item.purchase_price,
        currency: item.currency,
        purchase_date: new Date().toISOString().split("T")[0],
        total_uses: uses,
        benchmark_cost_per_use: item.benchmark_cost_per_use ?? null,
        target_cost_per_use: item.target_cost_per_use ?? null,
        notes: item.notes ?? null,
        created_at: new Date().toISOString(),
      };

      const metrics = old.costPerUse?.metrics || {};
      return {
        ...old,
        costPerUse: {
          ...old.costPerUse,
          items: [newCpu, ...existingItems],
          metrics: {
            ...metrics,
            total_tracked_assets: (metrics.total_tracked_assets || 0) + 1,
            total_invested: (metrics.total_invested || 0) + item.purchase_price,
            total_money_saved:
              (metrics.total_money_saved || 0) + Math.round(moneySaved),
          },
        },
      };
    });
  };

  const incrementCostPerUseOptimistic = (id: number) => {
    queryClient.setQueryData(FINANCE_KEYS.wealthSummary, (old: any) => {
      if (!old || !old.costPerUse?.items) return old;
      let deltaSaved = 0;
      const items = old.costPerUse.items.map((it: CostPerUseItem) => {
        if (it.id !== id) return it;
        const uses = (it.total_uses || 1) + 1;
        const benchmark = Number(it.benchmark_cost_per_use || 0);
        if (benchmark > 0) {
          const oldSaved = Math.max(
            0,
            benchmark * (it.total_uses || 1) - it.purchase_price
          );
          const newSaved = Math.max(0, benchmark * uses - it.purchase_price);
          deltaSaved = newSaved - oldSaved;
        }
        return {
          ...it,
          total_uses: uses,
          last_used_at: new Date().toISOString(),
        };
      });

      const metrics = old.costPerUse.metrics || {};
      return {
        ...old,
        costPerUse: {
          ...old.costPerUse,
          items,
          metrics: {
            ...metrics,
            total_money_saved:
              (metrics.total_money_saved || 0) + Math.round(deltaSaved),
          },
        },
      };
    });
  };

  const deleteCostPerUseOptimistic = (id: number) => {
    queryClient.setQueryData(FINANCE_KEYS.wealthSummary, (old: any) => {
      if (!old || !old.costPerUse?.items) return old;
      return {
        ...old,
        costPerUse: {
          ...old.costPerUse,
          items: old.costPerUse.items.filter(
            (it: CostPerUseItem) => it.id !== id
          ),
        },
      };
    });
  };

  // --- RECURRING ITEMS ---
  const upsertRecurringOptimistic = (item: {
    id?: number;
    title: string;
    amount: number;
    currency?: "UAH" | "USD";
    category_name: string;
    day_of_month: number;
  }) => {
    queryClient.setQueryData(
      FINANCE_KEYS.recurring,
      (old: RecurringItem[] | undefined) => {
        const list = Array.isArray(old) ? [...old] : [];
        if (item.id && item.id > 0) {
          return list.map((r) =>
            r.id === item.id
              ? {
                  ...r,
                  title: item.title,
                  amount: item.amount,
                  currency: item.currency || "UAH",
                  category_name: item.category_name,
                  day_of_month: item.day_of_month,
                }
              : r
          );
        }
        const newItem: RecurringItem = {
          id: -Date.now(),
          title: item.title,
          amount: item.amount,
          currency: item.currency || "UAH",
          category_name: item.category_name,
          day_of_month: item.day_of_month,
          is_active: true,
        };
        return [...list, newItem];
      }
    );
  };

  const deleteRecurringOptimistic = (id: number) => {
    queryClient.setQueryData(
      FINANCE_KEYS.recurring,
      (old: RecurringItem[] | undefined) => {
        if (!Array.isArray(old)) return old;
        return old.filter((r) => r.id !== id);
      }
    );
  };

  // --- RADAR SUBSCRIPTIONS ---
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
    createCycleOptimistic,
    updateCategoryBudgetOptimistic,
    deleteCategoryBudgetOptimistic,
    depositSavingsGoalOptimistic,
    upsertSavingsGoalOptimistic,
    deleteSavingsGoalOptimistic,
    upsertInvestmentOptimistic,
    deleteInvestmentOptimistic,
    addWishlistOptimistic,
    resolveWishlistOptimistic,
    deleteWishlistOptimistic,
    addCostPerUseOptimistic,
    incrementCostPerUseOptimistic,
    deleteCostPerUseOptimistic,
    upsertRecurringOptimistic,
    deleteRecurringOptimistic,
    markRecurringPaidOptimistic,
  };
}
