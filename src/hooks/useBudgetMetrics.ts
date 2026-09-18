import { useMemo } from "react";
import { Transaction, RecurringItem, BudgetCycle } from "@/types/finance";
import { CATEGORY_COLORS } from "@/constants/categories";
import {
  filterBudgetTransactions,
  calculateCycleDaysRemaining,
  getCycleDateRange,
  DEFAULT_BUDGET_LIMIT,
} from "@/lib/cycle-utils";
import { buildUpcomingSchedule } from "@/lib/subscription-radar";
import {
  calculateWeightedCalendarPacing,
  isWeekendOrLeisureDay,
} from "@/lib/weighted-pacing";

function getPreviousMonthKey(monthKey: string): string {
  const [year, month] = monthKey.split("-").map(Number);
  const prevDate = new Date(year, month - 2, 1);
  const prevYear = prevDate.getFullYear();
  const prevMonth = String(prevDate.getMonth() + 1).padStart(2, "0");
  return `${prevYear}-${prevMonth}`;
}

export type { BudgetCycle };

export interface BudgetMetricsParams {
  transactions: Transaction[];
  recurring: RecurringItem[];
  budgetLimit: number; // Сюди page.tsx вже передає правильний ліміт
  selectedDate: Date;
  activeCycle?: BudgetCycle | null;
  usdRate?: number;
}

export interface CategoryStatItem {
  name: string;
  amount: number;
  percentage: number;
  color: string;
}

export interface DailyStatItem {
  date: string;
  amount: number;
}

export interface BudgetMetricsResult {
  isCurrentMonth: boolean;
  remaining: number;
  spentPercent: number;
  exactPercent: number;
  safeDailySpend: number;
  flatDailySpend: number;
  safeWeekdaySpend: number;
  safeWeekendSpend: number;
  isTodayWeekend: boolean;
  pacingStatus: string;
  pacingAdvice: string;
  pacingAlpha: number;
  daysRemaining: number;
  barColor: string;
}

export function useBudgetMetrics({
  transactions,
  recurring,
  budgetLimit,
  selectedDate,
  activeCycle,
  usdRate = 44.0,
}: BudgetMetricsParams) {
  // ✅ Оптимізація: Перевірка поточного місяця ізольована в useMemo
  const isCurrentMonth = useMemo(() => {
    const today = new Date();
    return (
      today.getFullYear() === selectedDate.getFullYear() &&
      today.getMonth() === selectedDate.getMonth()
    );
  }, [selectedDate]);

  const selectedMonthKey = useMemo(() => {
    return `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, "0")}`;
  }, [selectedDate]);

  const monthLabel = useMemo(() => {
    return selectedDate.toLocaleDateString("uk-UA", {
      month: "long",
      year: "numeric",
    });
  }, [selectedDate]);

  // 1. Усі календарні витрати обраного місяця (для журналу та MoM-порівняння)
  const monthTransactions = useMemo(() => {
    return transactions.filter((t) => {
      const d = new Date(t.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      return (
        key === selectedMonthKey &&
        !t.exclude_from_budget &&
        t.type === "expense"
      );
    });
  }, [transactions, selectedMonthKey]);

  // 2. Транзакції, що входять у розрахунок ліміту активного циклу
  const budgetTransactions = useMemo(() => {
    return filterBudgetTransactions(
      transactions,
      activeCycle,
      isCurrentMonth,
      monthTransactions
    );
  }, [transactions, monthTransactions, isCurrentMonth, activeCycle]);

  // Ліміт бюджету: береться напряму зі стейту page.tsx (там він вже безпечно прив'язаний до циклу)
  const effectiveLimit = budgetLimit || DEFAULT_BUDGET_LIMIT;

  // Вибірка попереднього місяця для блоку MoM
  const prevMonthKey = useMemo(
    () => getPreviousMonthKey(selectedMonthKey),
    [selectedMonthKey]
  );

  const previousMonthTransactions = useMemo(() => {
    return transactions.filter((t) => {
      const d = new Date(t.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      return (
        key === prevMonthKey && !t.exclude_from_budget && t.type === "expense"
      );
    });
  }, [transactions, prevMonthKey]);

  // Сума обов'язкових регулярних платежів (загальна)
  const recurringTotal = useMemo(() => {
    return recurring
      .filter((r) => r.is_active)
      .reduce((acc, r) => {
        const amt = Number(r.amount) || 0;
        return acc + (r.currency === "USD" ? amt * usdRate : amt);
      }, 0);
  }, [recurring, usdRate]);

  // Графік та сума ще не сплачених обов'язкових платежів (запобігає подвійному списанню вже виконаних підписок)
  const upcomingSchedule = useMemo(() => {
    return buildUpcomingSchedule(
      recurring,
      budgetTransactions,
      usdRate,
      selectedDate
    );
  }, [recurring, budgetTransactions, usdRate, selectedDate]);

  const unpaidRecurringTotal = useMemo(() => {
    return upcomingSchedule.metrics.remaining_this_month;
  }, [upcomingSchedule]);

  // Фактично витрачено в межах активного вікна
  const totalSpent = useMemo(() => {
    return budgetTransactions.reduce((acc, t) => acc + Number(t.amount), 0);
  }, [budgetTransactions]);

  // ✅ Оптимізація: Розрахунок зважених метрик темпу (EMA-калібрування звичок та розподіл будні/вихідні)
  const budgetMetrics = useMemo<BudgetMetricsResult>(() => {
    const now = new Date();
    const daysRemaining = calculateCycleDaysRemaining(
      activeCycle,
      selectedDate,
      now
    );

    const variableBudget = Math.max(0, effectiveLimit - unpaidRecurringTotal);
    const remaining =
      Math.round(Math.max(-effectiveLimit, variableBudget - totalSpent) * 100) /
      100;
    const spentPercent =
      variableBudget > 0 ? (totalSpent / variableBudget) * 100 : 100;

    const flatDailySpend =
      daysRemaining > 0 && remaining > 0
        ? Math.round(remaining / daysRemaining)
        : 0;

    const cycleRange = getCycleDateRange(activeCycle, selectedDate);
    const pacing = calculateWeightedCalendarPacing(transactions, {
      startDate: cycleRange.startDate,
      endDate: cycleRange.endDate,
      totalBudgetLimit: effectiveLimit,
      currentExpenseTotal: totalSpent,
      upcomingObligations: upcomingSchedule.upcoming.map((u) => ({
        title: u.title,
        amount:
          u.currency === "USD"
            ? Math.round(u.amount * usdRate)
            : Number(u.amount),
        day_of_month: u.day_of_month,
        is_paid: u.status === "paid",
      })),
      now,
    });

    const isTodayWeekend = isWeekendOrLeisureDay(now.getDay());
    const safeWeekdaySpend = pacing.pacing.safeWeekdaySpend || flatDailySpend;
    const safeWeekendSpend = pacing.pacing.safeWeekendSpend || flatDailySpend;
    const todaySafeSpend = isTodayWeekend ? safeWeekendSpend : safeWeekdaySpend;

    let barColor = "#10B981";
    if (spentPercent > 90) barColor = "#EF4444";
    else if (spentPercent > 70) barColor = "#F59E0B";

    return {
      isCurrentMonth,
      remaining,
      spentPercent: Math.min(100, spentPercent),
      exactPercent: spentPercent,
      safeDailySpend: remaining > 0 && daysRemaining > 0 ? todaySafeSpend : 0,
      flatDailySpend,
      safeWeekdaySpend:
        remaining > 0 && daysRemaining > 0 ? safeWeekdaySpend : 0,
      safeWeekendSpend:
        remaining > 0 && daysRemaining > 0 ? safeWeekendSpend : 0,
      isTodayWeekend,
      pacingStatus: pacing.pacing.statusLabel,
      pacingAdvice: pacing.pacing.advice,
      pacingAlpha: pacing.habits.emaWeekendToWeekdayRatio,
      daysRemaining,
      barColor,
    };
  }, [
    totalSpent,
    effectiveLimit,
    unpaidRecurringTotal,
    upcomingSchedule,
    transactions,
    selectedDate,
    isCurrentMonth,
    activeCycle,
    usdRate,
  ]);

  // Структура витрат за категоріями
  const categoryStats = useMemo<CategoryStatItem[]>(() => {
    const stats: Record<string, number> = {};
    budgetTransactions.forEach((t) => {
      const cat = t.category_name || "Інше";
      stats[cat] = (stats[cat] || 0) + Number(t.amount);
    });

    return Object.entries(stats)
      .map(([name, amount]) => ({
        name,
        amount,
        percentage:
          totalSpent > 0 ? Math.round((amount / totalSpent) * 100) : 0,
        color: CATEGORY_COLORS[name] || "#71717A",
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [budgetTransactions, totalSpent]);

  // Щоденна динаміка для графіка
  const dailyStats = useMemo<DailyStatItem[]>(() => {
    const daysMap: Record<string, number> = {};
    budgetTransactions.forEach((t) => {
      const date = new Date(t.created_at);
      const key = `${String(date.getDate()).padStart(2, "0")}.${String(
        date.getMonth() + 1
      ).padStart(2, "0")}`;
      daysMap[key] = (daysMap[key] || 0) + Number(t.amount);
    });

    return Object.entries(daysMap)
      .map(([date, amount]) => ({ date, amount }))
      .reverse();
  }, [budgetTransactions]);

  return {
    selectedMonthKey,
    monthLabel,
    monthTransactions,
    budgetTransactions,
    filteredTransactions: budgetTransactions,
    prevMonthKey,
    previousMonthTransactions,
    recurringTotal,
    totalSpent,
    budgetMetrics,
    categoryStats,
    dailyStats,
    effectiveLimit,
    isCurrentMonth,
  };
}
