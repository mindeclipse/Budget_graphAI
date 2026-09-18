"use client";

import { useMemo } from "react";
import { calculateBurnRateData } from "./burn-rate/calculations";
import { BurnRateChartProps } from "./burn-rate/types";
import { BurnRateHeader } from "./burn-rate/BurnRateHeader";
import { BurnRateLineChart } from "./burn-rate/BurnRateLineChart";
import { BurnRateSummaryFooter } from "./burn-rate/BurnRateSummaryFooter";

export type {
  BudgetCycle,
  RecurringItem,
  Transaction,
  BurnRateTransaction,
  BurnRateRecurringItem,
  BurnRatePoint,
  CalculateBurnRateParams,
  BurnRateResult,
  BurnRateChartProps,
} from "./burn-rate/types";

export { calculateBurnRateData } from "./burn-rate/calculations";

export function BurnRateChart({
  transactions,
  budgetLimit,
  recurringTotal = 0,
  selectedMonthKey,
  recurring = [],
  usdRate = 44.0,
  activeCycle = null,
}: BurnRateChartProps) {
  const chartData = useMemo(() => {
    return calculateBurnRateData({
      transactions,
      budgetLimit,
      recurringTotal,
      selectedMonthKey,
      recurring,
      usdRate,
      activeCycle,
    });
  }, [
    transactions,
    budgetLimit,
    recurringTotal,
    selectedMonthKey,
    recurring,
    usdRate,
    activeCycle,
  ]);

  const {
    data,
    currentDay,
    isCurrentMonth,
    isFutureMonth,
    isCycleMode,
    runningTotal,
    projectedMonthEnd,
  } = chartData;

  const targetIndex = currentDay > 0 ? currentDay - 1 : 0;
  const idealToday = data[targetIndex] ? data[targetIndex].ideal : 0;
  const diffFromTarget = runningTotal - idealToday;
  const isOverPace = diffFromTarget > 0;

  return (
    <div className="rounded-2xl border border-zinc-800/80 bg-zinc-950 p-5 shadow-sm">
      <BurnRateHeader
        isCycleMode={isCycleMode}
        activeCycle={activeCycle}
        budgetLimit={budgetLimit}
        isFutureMonth={isFutureMonth}
        isOverPace={isOverPace}
        diffFromTarget={diffFromTarget}
      />

      <BurnRateLineChart
        data={data}
        budgetLimit={budgetLimit}
        isOverPace={isOverPace}
      />

      <BurnRateSummaryFooter
        runningTotal={runningTotal}
        idealToday={idealToday}
        projectedMonthEnd={projectedMonthEnd}
        budgetLimit={budgetLimit}
        isCurrentMonth={isCurrentMonth}
      />
    </div>
  );
}
