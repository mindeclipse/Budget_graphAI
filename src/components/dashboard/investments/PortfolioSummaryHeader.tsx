import { ArrowUpRight, ArrowDownRight } from "lucide-react";
import { ASSET_TYPE_LABELS } from "./types";

interface PortfolioSummaryHeaderProps {
  totalPortfolioUah: number;
  totalInvestedUah: number;
  profitUah: number;
  profitPercent: number;
  typeDistribution: Record<string, number>;
}

export function PortfolioSummaryHeader({
  totalPortfolioUah,
  totalInvestedUah,
  profitUah,
  profitPercent,
  typeDistribution,
}: PortfolioSummaryHeaderProps) {
  const isProfit = profitUah >= 0;

  return (
    <div className="mb-5 rounded-2xl border border-zinc-800/60 bg-zinc-950/40 p-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-baseline">
        <div>
          <span className="text-xs font-medium text-zinc-400">
            Поточна вартість портфеля
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-extrabold text-white tabular-nums sm:text-2xl">
              {Math.round(totalPortfolioUah).toLocaleString()} ₴
            </span>
            <span className="text-xs text-zinc-500 tabular-nums">
              (вкладено {Math.round(totalInvestedUah).toLocaleString()} ₴)
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`flex items-center gap-1 rounded-xl px-2.5 py-1 text-xs font-bold tabular-nums ${
              isProfit
                ? "border border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                : "border border-rose-500/20 bg-rose-500/10 text-rose-400"
            }`}
          >
            {isProfit ? (
              <ArrowUpRight size={14} />
            ) : (
              <ArrowDownRight size={14} />
            )}
            <span>
              {isProfit ? "+" : ""}
              {Math.round(profitUah).toLocaleString()} ₴ (
              {profitPercent >= 0 ? "+" : ""}
              {profitPercent.toFixed(1)}%)
            </span>
          </span>
        </div>
      </div>

      {/* Структура активів */}
      {totalPortfolioUah > 0 && (
        <div className="mt-4 border-t border-zinc-800/60 pt-3">
          <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-zinc-900">
            {Object.entries(typeDistribution).map(([typeKey, val]) => {
              if (val <= 0) return null;
              const pct = (val / totalPortfolioUah) * 100;
              const cfg = ASSET_TYPE_LABELS[typeKey] || ASSET_TYPE_LABELS.other;

              return (
                <div
                  key={typeKey}
                  title={`${cfg.label}: ${pct.toFixed(1)}%`}
                  className={`h-full ${cfg.color} transition-all`}
                  style={{ width: `${pct}%` }}
                />
              );
            })}
          </div>

          <div className="mt-2.5 flex flex-wrap gap-2 text-[10px]">
            {Object.entries(typeDistribution).map(([typeKey, val]) => {
              if (val <= 0) return null;
              const pct = ((val / totalPortfolioUah) * 100).toFixed(0);
              const cfg = ASSET_TYPE_LABELS[typeKey] || ASSET_TYPE_LABELS.other;

              return (
                <div
                  key={typeKey}
                  className="flex items-center gap-1.5 text-zinc-300"
                >
                  <span className={`h-2 w-2 rounded-full ${cfg.color}`} />
                  <span>{cfg.label}:</span>
                  <span className="font-semibold text-white">{pct}%</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
