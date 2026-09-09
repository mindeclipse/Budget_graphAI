"use client";

import React, { useMemo } from "react";
import { ArrowDownRight, ArrowUpRight, Minus, Scale } from "lucide-react";

interface Transaction {
  id: number;
  amount: number;
  category_name: string;
  type?: string;
  created_at: string;
}

interface MoMComparisonProps {
  currentTransactions: Transaction[];
  previousTransactions: Transaction[];
  currentMonthLabel: string;
  previousMonthLabel: string;
  title?: string;
}

interface CategoryDiff {
  category: string;
  currentAmount: number;
  prevAmount: number;
  diffAmount: number;
  percentChange: number | null; // null якщо в минулому місяці було 0
}

export function MoMComparison({
  currentTransactions,
  previousTransactions,
  currentMonthLabel,
  previousMonthLabel,
  title = "Порівняння з минулим циклом",
}: MoMComparisonProps) {
  const {
    categoryDiffs,
    totalCurrent,
    totalPrev,
    totalDiffAmount,
    totalPercentChange,
  } = useMemo(() => {
    // 1. Агрегація поточного місяця
    const currMap: Record<string, number> = {};
    let currTotal = 0;
    currentTransactions.forEach((tx) => {
      if (tx.type && tx.type !== "expense") return;
      const amt = Number(tx.amount) || 0;
      currMap[tx.category_name] = (currMap[tx.category_name] || 0) + amt;
      currTotal += amt;
    });

    // 2. Агрегація попереднього місяця
    const prevMap: Record<string, number> = {};
    let prevTotal = 0;
    previousTransactions.forEach((tx) => {
      if (tx.type && tx.type !== "expense") return;
      const amt = Number(tx.amount) || 0;
      prevMap[tx.category_name] = (prevMap[tx.category_name] || 0) + amt;
      prevTotal += amt;
    });

    // 3. Об'єднання всіх унікальних категорій
    const allCategories = Array.from(
      new Set([...Object.keys(currMap), ...Object.keys(prevMap)])
    );

    const diffs: CategoryDiff[] = allCategories.map((cat) => {
      const cur = currMap[cat] || 0;
      const prv = prevMap[cat] || 0;
      const diff = cur - prv;
      const pct = prv > 0 ? ((cur - prv) / prv) * 100 : null;

      return {
        category: cat,
        currentAmount: cur,
        prevAmount: prv,
        diffAmount: diff,
        percentChange: pct,
      };
    });

    // Сортуємо: спочатку категорії з найбільшими витратами в поточному місяці
    diffs.sort((a, b) => b.currentAmount - a.currentAmount);

    const totDiff = currTotal - prevTotal;
    const totPct =
      prevTotal > 0 ? ((currTotal - prevTotal) / prevTotal) * 100 : null;

    return {
      categoryDiffs: diffs,
      totalCurrent: currTotal,
      totalPrev: prevTotal,
      totalDiffAmount: totDiff,
      totalPercentChange: totPct,
    };
  }, [currentTransactions, previousTransactions]);

  if (categoryDiffs.length === 0) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-zinc-900 bg-zinc-950 p-5 shadow-sm">
      {/* Заголовок блоку */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xs font-semibold tracking-wider text-zinc-400 uppercase">
            <Scale size={14} className="text-zinc-500" />
            {title}
          </h2>
          <p className="mt-0.5 text-[11px] text-zinc-500">
            Динаміка витрат: {currentMonthLabel} проти {previousMonthLabel}
          </p>
        </div>

        {/* Загальний підсумок зміни */}
        <div className="flex items-center gap-2">
          {totalDiffAmount > 0 ? (
            <span className="flex items-center gap-1 rounded-full border border-rose-800/40 bg-rose-950/40 px-2.5 py-1 text-[11px] font-medium text-rose-400">
              <ArrowUpRight size={12} />+
              {Math.abs(totalDiffAmount).toLocaleString("uk-UA")} ₴
              {totalPercentChange !== null &&
                ` (+${totalPercentChange.toFixed(1)}%)`}
            </span>
          ) : totalDiffAmount < 0 ? (
            <span className="flex items-center gap-1 rounded-full border border-emerald-800/40 bg-emerald-950/40 px-2.5 py-1 text-[11px] font-medium text-emerald-400">
              <ArrowDownRight size={12} />-
              {Math.abs(totalDiffAmount).toLocaleString("uk-UA")} ₴
              {totalPercentChange !== null &&
                ` (${totalPercentChange.toFixed(1)}%)`}
            </span>
          ) : (
            <span className="flex items-center gap-1 rounded-full border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-[11px] font-medium text-zinc-400">
              <Minus size={12} /> 0 ₴ (без змін)
            </span>
          )}
        </div>
      </div>

      {/* Таблиця категорій */}
      <div className="divide-y divide-zinc-900 overflow-x-auto">
        <div className="grid grid-cols-12 pb-2 text-[10px] tracking-wider text-zinc-500 uppercase">
          <div className="col-span-5">Категорія</div>
          <div className="col-span-2 text-right">{previousMonthLabel}</div>
          <div className="col-span-3 text-right">{currentMonthLabel}</div>
          <div className="col-span-2 text-right">Зміна</div>
        </div>

        {categoryDiffs.map((row) => {
          const isIncreased = row.diffAmount > 0;
          const isDecreased = row.diffAmount < 0;

          return (
            <div
              key={row.category}
              className="grid grid-cols-12 items-center py-2.5 text-xs transition-colors hover:bg-white/[0.02]"
            >
              <div className="col-span-5 truncate font-medium text-zinc-200">
                {row.category}
              </div>

              <div className="col-span-2 text-right text-zinc-500">
                {row.prevAmount > 0
                  ? `${row.prevAmount.toLocaleString("uk-UA")} ₴`
                  : "—"}
              </div>

              <div className="col-span-3 text-right font-semibold text-zinc-200">
                {row.currentAmount > 0
                  ? `${row.currentAmount.toLocaleString("uk-UA")} ₴`
                  : "0 ₴"}
              </div>

              <div className="col-span-2 flex items-center justify-end gap-1 font-mono text-[11px]">
                {isIncreased && (
                  <span className="flex items-center text-rose-400">
                    <ArrowUpRight size={11} />
                    {row.percentChange !== null
                      ? `+${row.percentChange.toFixed(0)}%`
                      : "Нова"}
                  </span>
                )}
                {isDecreased && (
                  <span className="flex items-center text-emerald-400">
                    <ArrowDownRight size={11} />
                    {row.percentChange !== null
                      ? `${row.percentChange.toFixed(0)}%`
                      : "—"}
                  </span>
                )}
                {!isIncreased && !isDecreased && (
                  <span className="text-zinc-600">—</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
