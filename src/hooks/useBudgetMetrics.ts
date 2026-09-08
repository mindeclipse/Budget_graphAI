import { useMemo } from "react";
import { Transaction, RecurringItem } from "@/types/finance";
import { CATEGORY_COLORS } from "@/constants/categories";

const ESTIMATED_USD_RATE = 44.5;

function getPreviousMonthKey(monthKey: string): string {
  const [year, month] = monthKey.split("-").map(Number);
  const prevDate = new Date(year, month - 2, 1);
  const prevYear = prevDate.getFullYear();
  const prevMonth = String(prevDate.getMonth() + 1).padStart(2, "0");
  return `${prevYear}-${prevMonth}`;
}

export interface BudgetMetricsParams {
  transactions: Transaction[];
  recurring: RecurringItem[];
  budgetLimit: number;
  selectedDate: Date;
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
}: BudgetMetricsParams) {
  // Ключ активного місяця ("YYYY-MM")
  const selectedMonthKey = useMemo(() => {
    return `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, "0")}`;
  }, [selectedDate]);

  // Локалізована назва місяця ("вересень 2026")
  const monthLabel = useMemo(() => {
    return selectedDate.toLocaleDateString("uk-UA", {
      month: "long",
      year: "numeric",
    });
  }, [selectedDate]);

  // Фільтрація транзакцій за активний місяць
  const filteredTransactions = useMemo(() => {
    return transactions.filter((t) => {
      const d = new Date(t.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      return key === selectedMonthKey;
    });
  }, [transactions, selectedMonthKey]);

  // Ключ та вибірка попереднього місяця (для блоку MoM)
  const prevMonthKey = useMemo(
    () => getPreviousMonthKey(selectedMonthKey),
    [selectedMonthKey]
  );

  const previousMonthTransactions = useMemo(() => {
    return transactions.filter((t) => {
      const d = new Date(t.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      return key === prevMonthKey;
    });
  }, [transactions, prevMonthKey]);

  // Сума активних постійних витрат із конвертацією USD
  const recurringTotal = useMemo(() => {
    return recurring
      .filter((r) => r.is_active)
      .reduce((acc, r) => {
        const amt = Number(r.amount) || 0;
        return acc + (r.currency === "USD" ? amt * ESTIMATED_USD_RATE : amt);
      }, 0);
  }, [recurring]);

  // Фактична сума витрат за місяць
  const totalSpent = useMemo(() => {
    return filteredTransactions.reduce((acc, t) => acc + Number(t.amount), 0);
  }, [filteredTransactions]);

  // Показники прогресу бюджету
  const budgetMetrics = useMemo<BudgetMetricsResult>(() => {
    const now = new Date();
    const isCurrentMonth =
      now.getFullYear() === selectedDate.getFullYear() &&
      now.getMonth() === selectedDate.getMonth();

    const totalDaysInMonth = new Date(
      selectedDate.getFullYear(),
      selectedDate.getMonth() + 1,
      0
    ).getDate();

    let daysRemaining = 0;
    if (isCurrentMonth) {
      daysRemaining = Math.max(1, totalDaysInMonth - now.getDate() + 1);
    }

    // 1. Вільний бюджет на місяць за вирахуванням зарезервованих постійних витрат
    const variableBudget = Math.max(0, budgetLimit - recurringTotal);

    // 2. Реальний залишок вільних коштів
    const remaining = variableBudget - totalSpent;

    // 3. Відсоток вичерпання саме вільного бюджету
    const spentPercent =
      variableBudget > 0 ? (totalSpent / variableBudget) * 100 : 100;

    // 4. Денний ліміт ділиться тільки з реально залишених коштів
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
  }, [totalSpent, budgetLimit, recurringTotal, selectedDate]);

  // Агрегація витрат за категоріями
  const categoryStats = useMemo<CategoryStatItem[]>(() => {
    const stats: Record<string, number> = {};
    filteredTransactions.forEach((t) => {
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
  }, [filteredTransactions, totalSpent]);

  // Щоденні витрати для гістограми
  const dailyStats = useMemo<DailyStatItem[]>(() => {
    const daysMap: Record<string, number> = {};
    filteredTransactions.forEach((t) => {
      const date = new Date(t.created_at);
      const key = `${String(date.getDate()).padStart(2, "0")}.${String(
        date.getMonth() + 1
      ).padStart(2, "0")}`;
      daysMap[key] = (daysMap[key] || 0) + Number(t.amount);
    });

    return Object.entries(daysMap)
      .map(([date, amount]) => ({ date, amount }))
      .reverse();
  }, [filteredTransactions]);

  return {
    selectedMonthKey,
    monthLabel,
    filteredTransactions,
    prevMonthKey,
    previousMonthTransactions,
    recurringTotal,
    totalSpent,
    budgetMetrics,
    categoryStats,
    dailyStats,
  };
}
