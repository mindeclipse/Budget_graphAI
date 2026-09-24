import { ShieldCheck, TrendingUp } from "lucide-react";
import { SavingsMetrics } from "./types";

interface SavingsMetricsSummaryProps {
  metrics: SavingsMetrics;
  monthlyBurnRate: number;
  rates?: { USD: number; EUR: number; PLN: number };
}

export function SavingsMetricsSummary({
  metrics,
  monthlyBurnRate,
  rates,
}: SavingsMetricsSummaryProps) {
  const usdRate = rates?.USD || 44.0;
  const totalSavedUsd =
    metrics.totalSavedUsdEquivalent !== undefined
      ? metrics.totalSavedUsdEquivalent
      : usdRate > 0
        ? metrics.totalSavedUahEquivalent / usdRate
        : 0;

  return (
    <div className="mb-5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
      {/* Загальний капітал заощаджень */}
      <div className="rounded-2xl border border-zinc-800/60 bg-zinc-950/40 p-3">
        <div className="flex items-center justify-between text-[11px] text-zinc-400">
          <span>Всього в скарбничках</span>
          <ShieldCheck size={14} className="text-emerald-400" />
        </div>
        <div className="mt-1 flex flex-wrap items-baseline gap-1.5">
          <span className="text-base font-extrabold text-white tabular-nums sm:text-lg">
            {Math.round(metrics.totalSavedUahEquivalent).toLocaleString()} ₴
          </span>
          <span className="text-xs text-zinc-500 tabular-nums">
            (≈ {Math.round(totalSavedUsd).toLocaleString()} $)
          </span>
          {metrics.hasAnyTarget && (
            <span className="text-xs font-medium text-zinc-500 tabular-nums">
              / {Math.round(metrics.totalTargetUahEquivalent).toLocaleString()}{" "}
              ₴
            </span>
          )}
        </div>

        {metrics.hasAnyTarget && (
          <div className="mt-2">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                style={{ width: `${metrics.totalPercent}%` }}
              />
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-zinc-500">
              <span>Прогрес цілей</span>
              <span className="font-semibold text-emerald-400">
                {metrics.totalPercent}%
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Runway (Запас автономності) */}
      <div className="rounded-2xl border border-zinc-800/60 bg-zinc-950/40 p-3">
        <div className="flex items-center justify-between text-[11px] text-zinc-400">
          <span>Запас автономності (Runway)</span>
          <TrendingUp size={14} className="text-emerald-400" />
        </div>
        <div className="mt-1 flex items-baseline gap-1.5">
          <span className="text-base font-extrabold text-white tabular-nums sm:text-lg">
            {metrics.runwayMonths}
          </span>
          <span className="text-xs font-medium text-zinc-400">міс.</span>
        </div>
        <p className="mt-1 text-[10px] text-zinc-500">
          При витратах ~{Math.round(monthlyBurnRate).toLocaleString()} ₴/міс
        </p>
      </div>
    </div>
  );
}
