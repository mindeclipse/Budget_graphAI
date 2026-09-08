import { useMemo } from "react";
import { Transaction, RecurringItem } from "@/types/finance";
import { CATEGORY_COLORS } from "@/constants/categories";

const ESTIMATED_USD_RATE = 44.5;
const CYCLE_DURATION_DAYS = 30; // Стандартна тривалість зарплатного циклу

function getPreviousMonthKey(monthKey: string): string {
  const [year, month] = monthKey.split("-").map(Number);
  const prevDate = new Date(year, month - 2, 1);
  const prevYear = prevDate.getFullYear();
  const prevMonth = String(prevDate.getMonth() + 1).padStart(2, "0");
  return `${prevYear}-${prevMonth}`;
}

export interface BudgetCycle {
  id: string;
  name: string;
  start_date: string;
  end_date?: string | null;
  budget_limit: number;
  is_active: boolean;
}

export interface BudgetMetricsParams {
  transactions: Transaction[];
  recurring: RecurringItem[];
  budgetLimit: number;
  selectedDate: Date;
  activeCycle?: BudgetCycle | null;
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
  daysRemaining: number;
  barColor: string;
}

export function useBudgetMetrics({
  transactions,
  recurring,
  budgetLimit,
  selectedDate,
  activeCycle,
}: BudgetMetricsParams) {
  const now = new Date();
  const isCurrentMonth =
    now.getFullYear() === selectedDate.getFullYear() &&
    now.getMonth() === selectedDate.getMonth();

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
  // Якщо є активний цикл — фільтруємо напряму з transactions від дати старту циклу
  const budgetTransactions = useMemo(() => {
    if (!isCurrentMonth || !activeCycle) {
      return monthTransactions;
    }

    const cycleStart = new Date(activeCycle.start_date).getTime();
    const cycleEnd = activeCycle.end_date
      ? new Date(activeCycle.end_date).getTime()
      : Infinity; // Поки цикл триває, враховуються всі витрати після дати старту

    return transactions.filter((t) => {
      if (t.exclude_from_budget || t.type !== "expense") return false;
      const txTime = new Date(t.created_at).getTime();
      return txTime >= cycleStart && txTime <= cycleEnd;
    });
  }, [transactions, monthTransactions, isCurrentMonth, activeCycle]);

  // Ліміт бюджету (для активного циклу береться встановлена сума циклу)
  const effectiveLimit = useMemo(() => {
    return isCurrentMonth && activeCycle?.budget_limit
      ? Number(activeCycle.budget_limit)
      : budgetLimit;
  }, [isCurrentMonth, activeCycle, budgetLimit]);

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

  // Сума обов'язкових регулярних платежів
  const recurringTotal = useMemo(() => {
    return recurring
      .filter((r) => r.is_active)
      .reduce((acc, r) => {
        const amt = Number(r.amount) || 0;
        return acc + (r.currency === "USD" ? amt * ESTIMATED_USD_RATE : amt);
      }, 0);
  }, [recurring]);

  // Фактично витрачено в межах активного вікна
  const totalSpent = useMemo(() => {
    return budgetTransactions.reduce((acc, t) => acc + Number(t.amount), 0);
  }, [budgetTransactions]);

  // Розрахунок метрик прогресу бюджету
  const budgetMetrics = useMemo<BudgetMetricsResult>(() => {
    let daysRemaining = 0;

    if (activeCycle && isCurrentMonth) {
      // Розрахунок за вікном зарплатного циклу (+30 днів від дати натискання "Новий цикл")
      const cycleStart = new Date(activeCycle.start_date);
      const cycleEnd = activeCycle.end_date
        ? new Date(activeCycle.end_date)
        : new Date(
            cycleStart.getTime() + CYCLE_DURATION_DAYS * 24 * 60 * 60 * 1000
          );

      const diffMs = cycleEnd.getTime() - now.getTime();
      const msPerDay = 1000 * 60 * 60 * 24;

      // Округляємо дні догори: у день старту циклу залишок становитиме 30 днів
      daysRemaining = Math.max(0, Math.ceil(diffMs / msPerDay));
    } else if (isCurrentMonth) {
      // Фоллбек на стандартний календарний місяць, якщо цикл не запущено
      const totalDaysInMonth = new Date(
        selectedDate.getFullYear(),
        selectedDate.getMonth() + 1,
        0
      ).getDate();
      daysRemaining = Math.max(1, totalDaysInMonth - now.getDate() + 1);
    }

    const variableBudget = Math.max(0, effectiveLimit - recurringTotal);
    const remaining = variableBudget - totalSpent;
    const spentPercent =
      variableBudget > 0 ? (totalSpent / variableBudget) * 100 : 100;

    // Безпечний щоденний ліміт спирається на дні активного циклу
    const safeDailySpend =
      daysRemaining > 0 && remaining > 0 ? remaining / daysRemaining : 0;

    let barColor = "#10B981";
    if (spentPercent > 90) barColor = "#EF4444";
    else if (spentPercent > 70) barColor = "#F59E0B";

    return {
      isCurrentMonth,
      remaining,
      spentPercent: Math.min(100, spentPercent),
      exactPercent: spentPercent,
      safeDailySpend,
      daysRemaining,
      barColor,
    };
  }, [
    totalSpent,
    effectiveLimit,
    recurringTotal,
    selectedDate,
    isCurrentMonth,
    activeCycle,
    now,
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
