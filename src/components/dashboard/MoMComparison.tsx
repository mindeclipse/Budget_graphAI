"use client";

import { useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Minus, Scale } from "lucide-react";
import { calculatePersonalCpi, PersonalCpiReport } from "@/lib/personal-cpi";
import { usePersonalCpiQuery } from "@/hooks/useFinanceQueries";
import {
  MoMComparisonProps,
  calculateMoMDiffs,
  PersonalCpiSection,
  CategoryDiffTable,
} from "./mom-comparison";

export type { MoMComparisonProps } from "./mom-comparison";

export function MoMComparison({
  currentTransactions,
  previousTransactions,
  currentMonthLabel,
  previousMonthLabel,
  title = "Порівняння з минулим циклом",
}: MoMComparisonProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [cpiViewMode, setCpiViewMode] = useState<"cycle" | "yoy">("cycle");
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
    return calculateMoMDiffs(currentTransactions, previousTransactions);
  }, [currentTransactions, previousTransactions]);

  if (categoryDiffs.length === 0) {
    return null;
  }

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
      <PersonalCpiSection
        activeCpiReport={activeCpiReport}
        cpiViewMode={cpiViewMode}
        isLoadingYoy={isLoadingYoy}
        onViewModeChange={setCpiViewMode}
      />

      {/* Таблиця категорій */}
      <CategoryDiffTable
        categoryDiffs={categoryDiffs}
        isExpanded={isExpanded}
        onToggleExpand={() => setIsExpanded(!isExpanded)}
        currentMonthLabel={currentMonthLabel}
        previousMonthLabel={previousMonthLabel}
        defaultVisibleCount={DEFAULT_VISIBLE_COUNT}
      />
    </div>
  );
}
