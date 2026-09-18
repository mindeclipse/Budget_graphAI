"use client";

import { useState } from "react";
import {
  Receipt,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  ChevronDown,
  ChevronUp,
  ShoppingCart,
  Cigarette,
  Utensils,
  Pill,
} from "lucide-react";
import { PersonalCpiReport } from "@/lib/personal-cpi";

interface PersonalCpiSectionProps {
  activeCpiReport: PersonalCpiReport;
  cpiViewMode: "cycle" | "yoy";
  isLoadingYoy: boolean;
  onViewModeChange: (mode: "cycle" | "yoy") => void;
}

export function PersonalCpiSection({
  activeCpiReport,
  cpiViewMode,
  isLoadingYoy,
  onViewModeChange,
}: PersonalCpiSectionProps) {
  const [isCpiOpen, setIsCpiOpen] = useState(false);

  const switcher = (
    <div className="flex rounded-lg border border-zinc-800 bg-zinc-900/90 p-0.5 text-[10px]">
      <button
        type="button"
        onClick={() => onViewModeChange("cycle")}
        className={`rounded px-2.5 py-1 font-medium transition-colors sm:px-2 sm:py-0.5 ${
          cpiViewMode === "cycle"
            ? "bg-zinc-800 text-zinc-100 shadow-sm"
            : "text-zinc-500 hover:text-zinc-300"
        }`}
      >
        Цикл
      </button>
      <button
        type="button"
        onClick={() => onViewModeChange("yoy")}
        className={`rounded px-2.5 py-1 font-medium transition-colors sm:px-2 sm:py-0.5 ${
          cpiViewMode === "yoy"
            ? "bg-zinc-800 text-zinc-100 shadow-sm"
            : "text-zinc-500 hover:text-zinc-300"
        }`}
      >
        Рік / База
      </button>
    </div>
  );

  const metricBadge =
    isLoadingYoy && cpiViewMode === "yoy" ? (
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
    );

  const expandButton = (
    <button
      type="button"
      onClick={() => setIsCpiOpen(!isCpiOpen)}
      className="rounded-lg border border-zinc-800/60 p-1 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
      title={isCpiOpen ? "Згорнути кошик" : "Деталі кошика"}
    >
      {isCpiOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
    </button>
  );

  return (
    <div className="mb-4 rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-3.5 shadow-sm transition-all">
      {/* Адаптивна шапка блоку: на мобільних 2 охайні рівні, на десктопі — в 1 рядок */}
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
        {/* Рівень 1: Іконка + Назва та підзаголовок (зліва); Метрика + Кнопка розгортання (справа на мобільних) */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-purple-500/30 bg-purple-500/10 text-purple-400">
              <Receipt size={14} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold whitespace-nowrap text-zinc-200">
                  Персональний CPI
                </span>
                <span className="hidden shrink-0 rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 text-[9px] font-medium tracking-wide text-zinc-400 sm:inline-block">
                  {activeCpiReport.periodMode === "yoy"
                    ? "Рік до року (YoY)"
                    : activeCpiReport.periodMode === "baseline"
                      ? "Базовий індекс"
                      : "До мин. циклу"}
                </span>
              </div>
              <p className="truncate text-[10px] text-zinc-500">
                Зміна реального середнього чека (супермаркети, куріння, кафе)
              </p>
            </div>
          </div>

          {/* На мобільному: показник індексу та стрілка розміщені праворуч від заголовка */}
          <div className="flex shrink-0 items-center gap-2 sm:hidden">
            {metricBadge}
            {expandButton}
          </div>
        </div>

        {/* Рівень 2: Перемикач режимів (на мобільних) / Повний блок керування (на десктопі) */}
        <div className="flex items-center justify-between gap-2 sm:justify-end">
          {switcher}
          <div className="hidden shrink-0 items-center gap-2 sm:flex">
            {metricBadge}
            {expandButton}
          </div>
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
                    {stat.categoryKey === "dining" && (
                      <Utensils size={12} className="text-amber-400" />
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
            <span className="text-zinc-400">{activeCpiReport.periodLabel}</span>{" "}
            проти{" "}
            <span className="text-zinc-400">
              {activeCpiReport.previousPeriodLabel}
            </span>
          </p>
        </div>
      )}
    </div>
  );
}
