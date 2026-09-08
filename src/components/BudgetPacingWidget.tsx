"use client";

import React from "react";

interface BudgetPacingWidgetProps {
  pacing?: {
    daysTotal: number;
    daysPassed: number;
    daysRemaining: number;
    cycleProgressPercent: number;
    totalExpense: number;
    dailyBurnRateActual: number;
    projectedExpenseTotal: number;
    safeDailySpendRemaining: number;
    categoryPacing: Array<{
      category: string;
      spent: number;
      limit: number | null;
      spentPercent: number | null;
      status: "ok" | "warning" | "exceeded";
    }>;
  };
  isLoading?: boolean;
}

export const BudgetPacingWidget: React.FC<BudgetPacingWidgetProps> = ({
  pacing,
  isLoading,
}) => {
  if (isLoading || !pacing) {
    return (
      <div className="h-32 animate-pulse rounded-2xl border border-zinc-800 bg-zinc-900 p-4" />
    );
  }

  const {
    daysPassed,
    daysTotal,
    daysRemaining,
    cycleProgressPercent,
    dailyBurnRateActual,
    projectedExpenseTotal,
    safeDailySpendRemaining,
    categoryPacing,
  } = pacing;

  const warningCategories = categoryPacing.filter((c) => c.status !== "ok");

  return (
    <div className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5 backdrop-blur">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium tracking-wider text-zinc-400 uppercase">
          Темп місяця ({daysPassed}/{daysTotal} дн.)
        </span>
        <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs font-semibold text-zinc-300">
          {cycleProgressPercent}% циклу
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-zinc-800 bg-zinc-800/40 p-3">
          <p className="text-[11px] text-zinc-400">Поточний burn rate</p>
          <p className="mt-0.5 text-lg font-bold text-zinc-100">
            {dailyBurnRateActual.toLocaleString("uk-UA")} ₴
            <span className="text-xs font-normal text-zinc-400">/день</span>
          </p>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-800/40 p-3">
          <p className="text-[11px] text-zinc-400">Безпечний денний чек</p>
          <p className="mt-0.5 text-lg font-bold text-emerald-400">
            {safeDailySpendRemaining.toLocaleString("uk-UA")} ₴
            <span className="text-xs font-normal text-emerald-500/80">
              /день
            </span>
          </p>
        </div>

        <div className="col-span-2 rounded-xl border border-zinc-800 bg-zinc-800/40 p-3 sm:col-span-1">
          <p className="text-[11px] text-zinc-400">Прогноз на кінець циклу</p>
          <p className="mt-0.5 text-lg font-bold text-zinc-200">
            ~{projectedExpenseTotal.toLocaleString("uk-UA")} ₴
          </p>
        </div>
      </div>

      {/* Шкала перебігу місяця */}
      <div className="space-y-1">
        <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
          <div
            className="h-2 rounded-full bg-emerald-500 transition-all duration-500"
            style={{ width: `${cycleProgressPercent}%` }}
          />
        </div>
        <p className="text-right text-[11px] text-zinc-500">
          Залишилося: {daysRemaining} дн.
        </p>
      </div>

      {/* Попередження про категорії з перевищенням ліміту */}
      {warningCategories.length > 0 && (
        <div className="space-y-2 border-t border-zinc-800/80 pt-2">
          <p className="text-xs font-medium text-amber-400">
            ⚠️ Увага до категорій:
          </p>
          <div className="space-y-1.5">
            {warningCategories.map((c) => (
              <div
                key={c.category}
                className="flex items-center justify-between rounded-lg bg-zinc-800/50 p-2 text-xs"
              >
                <span className="font-medium text-zinc-300">{c.category}</span>
                <span
                  className={`font-semibold ${
                    c.status === "exceeded" ? "text-rose-400" : "text-amber-400"
                  }`}
                >
                  {c.spent.toLocaleString("uk-UA")} ₴
                  {c.limit
                    ? ` / ${c.limit.toLocaleString("uk-UA")} ₴ (${c.spentPercent}%)`
                    : ""}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
