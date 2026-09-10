"use client";

import { useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Minus,
  Scale,
  ChevronDown,
  ChevronUp,
  Receipt,
  ShoppingCart,
  Cigarette,
  Pill,
} from "lucide-react";
import { calculatePersonalCpi, PersonalCpiReport } from "@/lib/personal-cpi";
import { usePersonalCpiQuery } from "@/hooks/useFinanceQueries";

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
  const [isExpanded, setIsExpanded] = useState(false);
  const [cpiViewMode, setCpiViewMode] = useState<"cycle" | "yoy">("cycle");
  const [isCpiOpen, setIsCpiOpen] = useState(false);
  const DEFAULT_VISIBLE_COUNT = 5;

  // 1. Миттєвий клієнтський розрахунок для циклів (нульова затримка)
  const cycleCpiReport = useMemo(() => {
    return calculatePersonalCpi(currentTransactions, previousTransactions, {
      periodMode: "mom",
      currentPeriodLabel: currentMonthLabel,
      previousPeriodLabel: previousMonthLabel,
    });
  }, [
    currentTransactions,
    previousTransactions,
    currentMonthLabel,
    previousMonthLabel,
  ]);

  // 2. Серверний запит для режиму Рік до року / Базовий індекс
  const { data: yoyCpiData, isLoading: isLoadingYoy } = usePersonalCpiQuery(
    cpiViewMode === "yoy"
  );

  const activeCpiReport: PersonalCpiReport =
    cpiViewMode === "yoy" && yoyCpiData ? yoyCpiData : cycleCpiReport;

  const { categoryDiffs, totalDiffAmount, totalPercentChange } = useMemo(() => {
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

    const diffs: CategoryDiff[] = allCategories
      .map((cat) => {
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
      })
      .filter((row) => row.currentAmount > 0 || row.prevAmount > 0);

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

  const displayedRows = isExpanded
    ? categoryDiffs
    : categoryDiffs.slice(0, DEFAULT_VISIBLE_COUNT);
  const hiddenCount = categoryDiffs.length - DEFAULT_VISIBLE_COUNT;

  return (
    <div className="relative rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]">
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

      {/* Блок Персонального індексу інфляції (Personal CPI) */}
      <div className="mb-4 rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-3.5 shadow-sm transition-all">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Ліва частина: іконка та назва */}
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-purple-500/30 bg-purple-500/10 text-purple-400">
              <Receipt size={14} />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-zinc-200">
                  Персональний CPI
                </span>
                <span className="rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 text-[9px] font-medium tracking-wide text-zinc-400">
                  {activeCpiReport.periodMode === "yoy"
                    ? "Рік до року (YoY)"
                    : activeCpiReport.periodMode === "baseline"
                      ? "Базовий індекс"
                      : "До мин. циклу"}
                </span>
              </div>
              <p className="text-[10px] text-zinc-500">
                Зміна реального середнього чека (супермаркети, куріння, аптеки)
              </p>
            </div>
          </div>

          {/* Права частина: перемикач режимів, показник та кнопка розкриття */}
          <div className="flex items-center gap-2">
            {/* Перемикач: Цикл vs Рік/База */}
            <div className="flex rounded-lg border border-zinc-800 bg-zinc-900/90 p-0.5 text-[10px]">
              <button
                type="button"
                onClick={() => setCpiViewMode("cycle")}
                className={`rounded px-2 py-0.5 font-medium transition-colors ${
                  cpiViewMode === "cycle"
                    ? "bg-zinc-800 text-zinc-100 shadow-sm"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                Цикл
              </button>
              <button
                type="button"
                onClick={() => setCpiViewMode("yoy")}
                className={`rounded px-2 py-0.5 font-medium transition-colors ${
                  cpiViewMode === "yoy"
                    ? "bg-zinc-800 text-zinc-100 shadow-sm"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                Рік / База
              </button>
            </div>

            {/* Значення індексу */}
            {isLoadingYoy && cpiViewMode === "yoy" ? (
              <span className="animate-pulse rounded-full border border-zinc-800 bg-zinc-900 px-2.5 py-0.5 font-mono text-[11px] text-zinc-500">
                ...
              </span>
            ) : activeCpiReport.overallInflationRate !== null ? (
              <span
                className={`flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-mono text-[11px] font-medium tabular-nums ${
                  activeCpiReport.overallInflationRate > 0
                    ? "border-rose-800/40 bg-rose-950/40 text-rose-400"
                    : activeCpiReport.overallInflationRate < 0
                      ? "border-emerald-800/40 bg-emerald-950/40 text-emerald-400"
                      : "border-zinc-800 bg-zinc-900 text-zinc-400"
                }`}
              >
                {activeCpiReport.overallInflationRate > 0 ? (
                  <ArrowUpRight size={11} />
                ) : activeCpiReport.overallInflationRate < 0 ? (
                  <ArrowDownRight size={11} />
                ) : (
                  <Minus size={11} />
                )}
                {activeCpiReport.overallInflationRate > 0 ? "+" : ""}
                {activeCpiReport.overallInflationRate.toFixed(1)}%
              </span>
            ) : (
              <span className="rounded-full border border-zinc-800 bg-zinc-900 px-2 py-0.5 text-[11px] text-zinc-600">
                —
              </span>
            )}

            {/* Кнопка розгортання деталей кошика */}
            <button
              type="button"
              onClick={() => setIsCpiOpen(!isCpiOpen)}
              className="rounded-lg border border-zinc-800/60 p-1 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
              title={isCpiOpen ? "Згорнути кошик" : "Деталі кошика"}
            >
              {isCpiOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
          </div>
        </div>

        {/* Деталізація категорій повсякденного вжитку */}
        {isCpiOpen && (
          <div className="mt-3 border-t border-zinc-800/60 pt-3">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {activeCpiReport.basketStats.map((stat) => (
                <div
                  key={stat.categoryKey}
                  className="flex flex-col justify-between rounded-lg border border-zinc-800/50 bg-zinc-900/50 p-2.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-300">
                      {stat.categoryKey === "groceries" && (
                        <ShoppingCart size={12} className="text-amber-400" />
                      )}
                      {stat.categoryKey === "smoking" && (
                        <Cigarette size={12} className="text-orange-400" />
                      )}
                      {stat.categoryKey === "health" && (
                        <Pill size={12} className="text-emerald-400" />
                      )}
                      {stat.categoryName}
                    </span>
                    {stat.inflationRate !== null ? (
                      <span
                        className={`font-mono text-[10px] font-semibold tabular-nums ${
                          stat.inflationRate > 0
                            ? "text-rose-400"
                            : stat.inflationRate < 0
                              ? "text-emerald-400"
                              : "text-zinc-400"
                        }`}
                      >
                        {stat.inflationRate > 0 ? "+" : ""}
                        {stat.inflationRate.toFixed(1)}%
                      </span>
                    ) : (
                      <span className="text-[10px] text-zinc-600">—</span>
                    )}
                  </div>

                  <div className="mt-2 flex items-baseline justify-between text-[11px]">
                    <span className="text-[10px] text-zinc-500">Сер. чек:</span>
                    <div className="font-mono tabular-nums">
                      <span className="font-semibold text-zinc-200">
                        {stat.currentAvgCheck > 0
                          ? `${stat.currentAvgCheck.toLocaleString("uk-UA")} ₴`
                          : "—"}
                      </span>
                      {stat.previousAvgCheck > 0 && (
                        <span className="ml-1 text-[10px] text-zinc-500">
                          (було {stat.previousAvgCheck.toLocaleString("uk-UA")})
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mt-1 flex items-center justify-between text-[9px] text-zinc-500">
                    <span>Покупок:</span>
                    <span className="font-mono tabular-nums">
                      {stat.currentTxCount}
                      {stat.previousTxCount > 0 &&
                        ` проти ${stat.previousTxCount}`}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <p className="mt-2 text-[10px] text-zinc-500">
              💡 Порівняння:{" "}
              <span className="text-zinc-400">
                {activeCpiReport.periodLabel}
              </span>{" "}
              проти{" "}
              <span className="text-zinc-400">
                {activeCpiReport.previousPeriodLabel}
              </span>
              . Дрібні чеки (&lt;20 ₴) відфільтровано.
            </p>
          </div>
        )}
      </div>

      {/* Таблиця категорій */}
      <div className="divide-y divide-zinc-900 overflow-x-auto">
        <div className="grid grid-cols-12 pb-2 text-[10px] tracking-wider text-zinc-500 uppercase">
          <div className="col-span-5">Категорія</div>
          <div className="col-span-2 text-right">{previousMonthLabel}</div>
          <div className="col-span-3 text-right">{currentMonthLabel}</div>
          <div className="col-span-2 text-right">Зміна</div>
        </div>

        {displayedRows.map((row) => {
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

              {/* Минулий період */}
              <div className="col-span-2 text-right font-mono text-[11px] text-zinc-500 tabular-nums">
                {row.prevAmount > 0
                  ? `${row.prevAmount.toLocaleString("uk-UA")} ₴`
                  : "—"}
              </div>

              {/* Поточний період */}
              <div className="col-span-3 text-right font-mono text-[11px] font-semibold text-zinc-200 tabular-nums">
                {row.currentAmount > 0
                  ? `${row.currentAmount.toLocaleString("uk-UA")} ₴`
                  : "0 ₴"}
              </div>

              <div className="col-span-2 flex items-center justify-end gap-0.5 font-mono text-[11px] tabular-nums">
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

      {categoryDiffs.length > DEFAULT_VISIBLE_COUNT && (
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-zinc-800/80 bg-zinc-900/40 py-2 text-xs font-medium text-zinc-400 transition-all hover:border-zinc-700 hover:bg-zinc-800/60 hover:text-zinc-200"
        >
          {isExpanded ? (
            <>
              <ChevronUp size={13} /> Згорнути
            </>
          ) : (
            <>
              <ChevronDown size={13} /> Показати всі (+{hiddenCount})
            </>
          )}
        </button>
      )}
    </div>
  );
}
