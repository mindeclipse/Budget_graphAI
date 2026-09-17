"use client";

import { useMemo, useState, memo } from "react";
import {
  Percent,
  Coins,
  TrendingUp,
  PiggyBank,
  Info,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { InvestmentAsset, SavingsGoal } from "@/types/finance";
import {
  calculateCapitalYieldMetrics,
  ExchangeRates,
} from "@/lib/portfolio-analytics";

interface CapitalYieldMetricsProps {
  investments: InvestmentAsset[];
  savingsGoals: SavingsGoal[];
  rates?: Partial<ExchangeRates>;
}

export const CapitalYieldMetrics = memo(function CapitalYieldMetrics({
  investments,
  savingsGoals,
  rates,
}: CapitalYieldMetricsProps) {
  const [showDetails, setShowDetails] = useState(false);

  const metrics = useMemo(() => {
    return calculateCapitalYieldMetrics({
      investments,
      savingsGoals,
      rates,
    });
  }, [investments, savingsGoals, rates]);

  const {
    totalCapitalBaseUah,
    investmentsValueUah,
    savingsValueUah,
    projectedAnnualProfitUah,
    projectedMonthlyProfitUah,
    weightedYieldPercent,
    investmentsOnlyYieldPercent,
    investmentsCount,
    savingsCount,
  } = metrics;

  // Форматування чисел для української локалі
  const formattedWeightedYield = weightedYieldPercent.toLocaleString("uk-UA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const formattedAnnualProfit = projectedAnnualProfitUah.toLocaleString(
    "uk-UA",
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }
  );

  const formattedMonthlyProfit = Math.round(
    projectedMonthlyProfitUah
  ).toLocaleString("uk-UA");

  return (
    <div className="rounded-3xl border border-zinc-800/80 bg-zinc-900/60 p-4 shadow-sm backdrop-blur-xl transition-all sm:p-5">
      {/* 2-колонкова сітка ключових метрик капіталу */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
        {/* Картка 1: Середньозважена доходність портфеля */}
        <div className="flex flex-col justify-between rounded-2xl border border-zinc-800/80 bg-zinc-950/60 p-4 transition-all hover:border-zinc-700/80">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-400">
                <Percent size={16} />
              </div>
              <div className="min-w-0">
                <span className="text-[11px] font-bold tracking-wider text-zinc-300 uppercase">
                  Середньозважена доходність
                </span>
                <span className="ml-1 text-[10px] font-semibold text-zinc-500">
                  (%)
                </span>
              </div>
            </div>

            <span className="inline-flex w-[100px] shrink-0 flex-col items-center justify-center rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-center text-[10px] leading-tight font-semibold text-emerald-400">
              <span>Портфель +</span>
              <span>Скарбнички</span>
            </span>
          </div>

          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-extrabold tracking-tight text-white tabular-nums sm:text-3xl">
              {formattedWeightedYield}%
            </span>
            <span className="text-xs font-semibold text-zinc-400">річних</span>
          </div>

          <div className="mt-2 flex items-center justify-between border-t border-zinc-800/60 pt-2 text-[11px] text-zinc-400">
            <span className="flex items-center gap-1 text-zinc-400">
              <TrendingUp size={12} className="text-teal-400" />
              Лише інвестиції:
            </span>
            <span className="font-semibold text-teal-400 tabular-nums">
              {investmentsOnlyYieldPercent.toLocaleString("uk-UA", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
              %
            </span>
          </div>
        </div>

        {/* Картка 2: Прогноз річного прибутку */}
        <div className="flex flex-col justify-between rounded-2xl border border-zinc-800/80 bg-zinc-950/60 p-4 transition-all hover:border-zinc-700/80">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-sky-500/20 bg-sky-500/10 text-sky-400">
                <Coins size={16} />
              </div>
              <div className="min-w-0">
                <span className="text-[11px] font-bold tracking-wider text-zinc-300 uppercase">
                  Прогноз річного прибутку
                </span>
                <span className="ml-1 text-[10px] font-semibold text-zinc-500">
                  (грн)
                </span>
              </div>
            </div>

            <span className="inline-flex w-[100px] shrink-0 flex-col items-center justify-center rounded-full border border-sky-500/20 bg-sky-500/10 px-2.5 py-1 text-center text-[10px] leading-tight font-semibold text-sky-400">
              <span>Пасивний</span>
              <span>дохід</span>
            </span>
          </div>

          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-extrabold tracking-tight text-emerald-400 tabular-nums sm:text-3xl">
              {formattedAnnualProfit}
            </span>
            <span className="text-sm font-semibold text-emerald-500">₴</span>
          </div>

          <div className="mt-2 flex items-center justify-between border-t border-zinc-800/60 pt-2 text-[11px] text-zinc-400">
            <span className="text-zinc-400">Щомісячний еквівалент:</span>
            <span className="font-semibold text-zinc-200 tabular-nums">
              ~{formattedMonthlyProfit} ₴ / міс
            </span>
          </div>
        </div>
      </div>

      {/* Компактний футер з деталізацією бази капіталу */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-zinc-950/40 px-3 py-2 text-[11px] text-zinc-400">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-medium text-zinc-300">
            База капіталу:{" "}
            <strong className="text-white">
              {Math.round(totalCapitalBaseUah).toLocaleString("uk-UA")} ₴
            </strong>
          </span>
          <span className="hidden text-zinc-600 sm:inline">•</span>
          <span className="text-zinc-400">
            {Math.round(investmentsValueUah).toLocaleString("uk-UA")} ₴ активи (
            {investmentsCount})
          </span>
          <span className="hidden text-zinc-600 sm:inline">•</span>
          <span className="flex items-center gap-1 text-zinc-400">
            <PiggyBank size={12} className="text-emerald-400" />
            {Math.round(savingsValueUah).toLocaleString("uk-UA")} ₴ вільний кеш
            ({savingsCount})
          </span>
        </div>

        <button
          type="button"
          onClick={() => setShowDetails(!showDetails)}
          className="flex items-center gap-1 text-[10px] font-semibold text-zinc-400 transition-colors hover:text-zinc-200"
        >
          <Info size={11} />
          <span>{showDetails ? "Згорнути" : "Як розраховується"}</span>
          {showDetails ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
        </button>
      </div>

      {/* Випадаюча підказка з роз'ясненням логіки розрахунку */}
      {showDetails && (
        <div className="mt-2.5 rounded-xl border border-zinc-800/60 bg-zinc-950/80 p-3 text-[11px] leading-relaxed text-zinc-400">
          <p className="mb-1.5 font-semibold text-zinc-200">
            💡 Як формуються ці показники:
          </p>
          <ul className="list-disc space-y-1 pl-4 text-zinc-400">
            <li>
              <strong className="text-zinc-300">Прогноз прибутку:</strong> сума
              очікуваних виплат (дивідендів, купонів ОВДП, процентів депозитів)
              за поточними річними ставками всіх активів портфеля.
            </li>
            <li>
              <strong className="text-zinc-300">
                Середньозважена доходність:
              </strong>{" "}
              враховує як активи під відсоток (
              {investmentsOnlyYieldPercent.toFixed(2)}
              %), так і кошти у вільних скарбничках без дедлайну/цілі (кеш з 0%
              доходності), відображаючи реальну середню віддачу на весь ваш
              робочий капітал.
            </li>
          </ul>
        </div>
      )}
    </div>
  );
});
