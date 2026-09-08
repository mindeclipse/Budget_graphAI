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
  const effectiveNow =
    now > endDate ? endDate : now < startDate ? startDate : now;

  const msPerDay = 1000 * 60 * 60 * 24;
  const daysTotal = Math.max(
    1,
    Math.round((endDate.getTime() - startDate.getTime()) / msPerDay)
  );
  const daysPassed = Math.max(
    1,
    Math.min(
      daysTotal,
      Math.ceil((effectiveNow.getTime() - startDate.getTime()) / msPerDay)
    )
  );
  const daysRemaining = Math.max(0, daysTotal - daysPassed);
  const cycleProgressPercent = Math.min(
    100,
    Math.round((daysPassed / daysTotal) * 100)
  );

  // Фільтрація витрат та доходів за обраний період
  const cycleTx = transactions.filter((t) => {
    const txDate = new Date(t.created_at || (t as any).date);
    return txDate >= startDate && txDate <= endDate;
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
    cycleStart: startDate.toISOString(),
    cycleEnd: endDate.toISOString(),
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
