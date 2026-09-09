import { Transaction } from "@/types/finance";

export interface CategoryBudgetLimit {
  category: string;
  limitAmount: number;
}

export interface BudgetPaceAnalysis {
  cycleStart: string;
  cycleEnd: string;
  daysTotal: number;
  daysPassed: number;
  daysRemaining: number;
  cycleProgressPercent: number;
  totalIncome: number;
  totalExpense: number;
  netSavings: number;
  dailyBurnRateActual: number;
  projectedExpenseTotal: number;
  safeDailySpendRemaining: number;
  categoryPacing: Array<{
    category: string;
    spent: number;
    limit: number | null;
    spentPercent: number | null;
    projectedSpent: number;
    status: "ok" | "warning" | "exceeded";
  }>;
}

export function calculateBudgetPacing(
  transactions: Transaction[],
  startDate: Date,
  endDate: Date,
  categoryLimits: CategoryBudgetLimit[] = [],
  totalBudgetLimit?: number
): BudgetPaceAnalysis {
  const now = new Date();

  // Захист від невалідних дат
  let safeStart =
    startDate instanceof Date && !isNaN(startDate.getTime())
      ? startDate
      : new Date(now.getFullYear(), now.getMonth(), 1);
  let safeEnd =
    endDate instanceof Date && !isNaN(endDate.getTime())
      ? endDate
      : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  if (safeStart > safeEnd) {
    const temp = safeStart;
    safeStart = safeEnd;
    safeEnd = temp;
  }

  const effectiveNow =
    now > safeEnd ? safeEnd : now < safeStart ? safeStart : now;

  const msPerDay = 1000 * 60 * 60 * 24;
  const daysTotal = Math.max(
    1,
    Math.round((safeEnd.getTime() - safeStart.getTime()) / msPerDay)
  );
  const daysPassed = Math.max(
    1,
    Math.min(
      daysTotal,
      Math.ceil((effectiveNow.getTime() - safeStart.getTime()) / msPerDay)
    )
  );
  const daysRemaining = Math.max(0, daysTotal - daysPassed);
  const cycleProgressPercent = Math.min(
    100,
    Math.round((daysPassed / daysTotal) * 100)
  );

  // Фільтрація витрат та доходів за обраний період із перевіркою коректності дати
  const cycleTx = transactions.filter((t) => {
    const rawDate = t.created_at || (t as any).date;
    if (!rawDate) return false;
    const txDate = new Date(rawDate);
    if (isNaN(txDate.getTime())) return false;
    return txDate >= safeStart && txDate <= safeEnd;
  });

  let totalIncome = 0;
  let totalExpense = 0;
  const categorySpendingMap = new Map<string, number>();

  for (const tx of cycleTx) {
    const amt = Number(tx.amount);
    if (tx.type === "income") {
      totalIncome += amt;
    } else {
      totalExpense += amt;
      const cat = tx.category_name || "Інше";
      categorySpendingMap.set(cat, (categorySpendingMap.get(cat) || 0) + amt);
    }
  }

  const dailyBurnRateActual = Math.round(totalExpense / daysPassed);
  const projectedExpenseTotal = Math.round(
    totalExpense + dailyBurnRateActual * daysRemaining
  );

  // Розрахунок безпечних щоденних витрат до кінця місяця
  let safeDailySpendRemaining = 0;
  if (
    totalBudgetLimit &&
    totalBudgetLimit > totalExpense &&
    daysRemaining > 0
  ) {
    safeDailySpendRemaining = Math.max(
      0,
      Math.round((totalBudgetLimit - totalExpense) / daysRemaining)
    );
  } else if (
    !totalBudgetLimit &&
    totalIncome > totalExpense &&
    daysRemaining > 0
  ) {
    safeDailySpendRemaining = Math.max(
      0,
      Math.round((totalIncome - totalExpense) / daysRemaining)
    );
  }

  // Аналіз темпу за категоріями
  const categoryPacing = Array.from(categorySpendingMap.entries()).map(
    ([category, spent]) => {
      const limitObj = categoryLimits.find(
        (l) => l.category.toLowerCase() === category.toLowerCase()
      );
      const limit = limitObj ? limitObj.limitAmount : null;
      const catDailyBurn = spent / daysPassed;
      const projectedSpent = Math.round(spent + catDailyBurn * daysRemaining);

      let spentPercent: number | null = null;
      let status: "ok" | "warning" | "exceeded" = "ok";

      if (limit && limit > 0) {
        spentPercent = Math.round((spent / limit) * 100);
        if (spent >= limit) {
          status = "exceeded";
        } else if (
          projectedSpent > limit ||
          spentPercent > cycleProgressPercent + 15
        ) {
          status = "warning";
        }
      }

      return {
        category,
        spent: Math.round(spent),
        limit,
        spentPercent,
        projectedSpent,
        status,
      };
    }
  );

  // Додаємо лімітовані категорії, де витрат ще не було
  categoryLimits.forEach((l) => {
    if (!categorySpendingMap.has(l.category)) {
      categoryPacing.push({
        category: l.category,
        spent: 0,
        limit: l.limitAmount,
        spentPercent: 0,
        projectedSpent: 0,
        status: "ok",
      });
    }
  });

  categoryPacing.sort((a, b) => (b.spentPercent || 0) - (a.spentPercent || 0));

  return {
    cycleStart: safeStart.toISOString(),
    cycleEnd: safeEnd.toISOString(),
    daysTotal,
    daysPassed,
    daysRemaining,
    cycleProgressPercent,
    totalIncome: Math.round(totalIncome),
    totalExpense: Math.round(totalExpense),
    netSavings: Math.round(totalIncome - totalExpense),
    dailyBurnRateActual,
    projectedExpenseTotal,
    safeDailySpendRemaining,
    categoryPacing,
  };
}
