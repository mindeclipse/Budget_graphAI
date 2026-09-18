import { useMemo } from "react";
import { Transaction, BudgetCycle } from "@/types/finance";
import {
  getCycleDateRange,
  filterTransactionsByDateRange,
} from "@/lib/cycle-utils";

interface UseCycleComparisonProps {
  cycles?: BudgetCycle[] | null;
  activeCycle?: BudgetCycle | null;
  transactions: Transaction[];
  monthTransactions: Transaction[];
  previousMonthTransactions: Transaction[];
  monthLabel: string;
}

export function useCycleComparison({
  cycles,
  activeCycle,
  transactions,
  monthTransactions,
  previousMonthTransactions,
  monthLabel,
}: UseCycleComparisonProps) {
  const previousCycle = useMemo(() => {
    if (!cycles || cycles.length === 0) return null;
    const activeIdx = cycles.findIndex(
      (c: BudgetCycle) => c.id === activeCycle?.id || c.is_active
    );
    return activeIdx !== -1 ? cycles[activeIdx + 1] || null : cycles[1] || null;
  }, [cycles, activeCycle]);

  return useMemo(() => {
    if (!activeCycle) {
      return {
        previousCycle,
        cycleCurrentTransactions: monthTransactions,
        cyclePreviousTransactions: previousMonthTransactions,
        cycleCurrentLabel: monthLabel,
        cyclePreviousLabel: "Мин. місяць",
      };
    }

    const currentRange = getCycleDateRange(activeCycle);
    const curr = filterTransactionsByDateRange(
      transactions,
      currentRange.startMs,
      currentRange.endMs
    );

    let prev: Transaction[] = [];
    if (previousCycle) {
      const prevRange = getCycleDateRange(previousCycle);
      prev = filterTransactionsByDateRange(
        transactions,
        prevRange.startMs,
        currentRange.startMs
      );
    }

    return {
      previousCycle,
      cycleCurrentTransactions: curr,
      cyclePreviousTransactions: prev,
      cycleCurrentLabel: activeCycle.name || "Поточний цикл",
      cyclePreviousLabel: previousCycle?.name || "Мин. цикл",
    };
  }, [
    activeCycle,
    previousCycle,
    transactions,
    monthTransactions,
    previousMonthTransactions,
    monthLabel,
  ]);
}
