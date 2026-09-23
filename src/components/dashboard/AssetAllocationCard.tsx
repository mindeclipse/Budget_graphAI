"use client";

import { useState, useMemo, memo } from "react";
import {
  PieChart,
  Scale,
  Sparkles,
  TrendingDown,
  ChevronRight,
  Shield,
  Layers,
  ArrowUpRight,
  CheckCircle2,
} from "lucide-react";
import { InvestmentAsset, SavingsGoal } from "@/types/finance";
import { convertToUah } from "@/lib/portfolio-analytics";

export interface AssetAllocationCardProps {
  investments: InvestmentAsset[];
  savingsGoals: SavingsGoal[];
  rates: { USD: number; EUR: number; PLN: number };
  costPerUseItemCount?: number;
  onOpenCostPerUse?: () => void;
}

type StrategyPreset = "balanced" | "conservative" | "growth";

const PRESET_TARGETS: Record<StrategyPreset, Record<string, number>> = {
  balanced: {
    bonds: 30,
    reit: 25,
    stocks: 20,
    savings: 15,
    deposit: 5,
    crypto: 5,
  },
  conservative: {
    bonds: 45,
    deposit: 20,
    savings: 20,
    reit: 10,
    stocks: 5,
    crypto: 0,
  },
  growth: {
    stocks: 35,
    reit: 25,
    bonds: 20,
    crypto: 10,
    savings: 10,
    deposit: 0,
  },
};

const CATEGORY_META: Record<
  string,
  { label: string; color: string; barBg: string; textClass: string }
> = {
  bonds: {
    label: "ОВДП (Облігації)",
    color: "bg-emerald-500",
    barBg: "from-emerald-600 to-teal-400",
    textClass: "text-emerald-400",
  },
  reit: {
    label: "Нерухомість (Inzhur)",
    color: "bg-indigo-500",
    barBg: "from-indigo-600 to-violet-400",
    textClass: "text-indigo-400",
  },
  stocks: {
    label: "Акції / ETF",
    color: "bg-cyan-500",
    barBg: "from-cyan-600 to-sky-400",
    textClass: "text-cyan-400",
  },
  deposit: {
    label: "Депозити",
    color: "bg-blue-500",
    barBg: "from-blue-600 to-indigo-400",
    textClass: "text-blue-400",
  },
  savings: {
    label: "Скарбнички & Кеш",
    color: "bg-pink-500",
    barBg: "from-pink-600 to-rose-400",
    textClass: "text-pink-400",
  },
  crypto: {
    label: "Криптовалюта",
    color: "bg-amber-500",
    barBg: "from-amber-600 to-yellow-400",
    textClass: "text-amber-400",
  },
  other: {
    label: "Інші активи",
    color: "bg-zinc-500",
    barBg: "from-zinc-600 to-zinc-400",
    textClass: "text-zinc-400",
  },
};

export const AssetAllocationCard = memo(function AssetAllocationCard({
  investments,
  savingsGoals,
  rates,
  costPerUseItemCount = 0,
  onOpenCostPerUse,
}: AssetAllocationCardProps) {
  const [strategy, setStrategy] = useState<StrategyPreset>("balanced");

  // Розрахунок капіталу за класами активів та валютами
  const { totalCapitalUah, categoryTotals, currencyTotals } = useMemo(() => {
    const catMap: Record<string, number> = {
      bonds: 0,
      reit: 0,
      stocks: 0,
      deposit: 0,
      crypto: 0,
      savings: 0,
      other: 0,
    };

    const curMap: Record<string, number> = {
      UAH: 0,
      USD: 0,
      EUR: 0,
      PLN: 0,
    };

    // 1. Інвестиційні активи (активні)
    investments.forEach((asset) => {
      if (asset.is_archived) return;
      const uah = convertToUah(asset.current_value, asset.currency, rates);
      const catKey = asset.asset_type in catMap ? asset.asset_type : "other";
      catMap[catKey] += uah;

      const curKey = asset.currency in curMap ? asset.currency : "UAH";
      curMap[curKey] += uah;
    });

    // 2. Скарбнички та накопичення (Cash & Goals)
    savingsGoals.forEach((goal) => {
      const uah = convertToUah(goal.current_amount, goal.currency, rates);
      catMap.savings += uah;

      const curKey = goal.currency in curMap ? goal.currency : "UAH";
      curMap[curKey] += uah;
    });

    const total = Object.values(catMap).reduce((a, b) => a + b, 0);

    return {
      totalCapitalUah: total,
      categoryTotals: catMap,
      currencyTotals: curMap,
    };
  }, [investments, savingsGoals, rates]);

  // Цільові відсотки поточної стратегії
  const targetAllocation = PRESET_TARGETS[strategy];

  // Аналіз відхилень та пошук класу для ребалансування
  const { allocationList, rebalancingTip } = useMemo(() => {
    if (totalCapitalUah === 0) {
      return { allocationList: [], rebalancingTip: null };
    }

    const list = Object.entries(categoryTotals)
      .map(([catKey, amountUah]) => {
        const actualPct = (amountUah / totalCapitalUah) * 100;
        const targetPct = targetAllocation[catKey] || 0;
        const deltaPct = actualPct - targetPct;
        const meta = CATEGORY_META[catKey] || CATEGORY_META.other;

        return {
          catKey,
          label: meta.label,
          color: meta.color,
          barBg: meta.barBg,
          textClass: meta.textClass,
          amountUah,
          actualPct,
          targetPct,
          deltaPct,
        };
      })
      .filter((item) => item.amountUah > 0 || item.targetPct > 0)
      .sort((a, b) => b.amountUah - a.amountUah);

    // Клас з найбільшим відставанням від цільової частки (недовантажений)
    const underweightCategories = list
      .filter((i) => i.deltaPct < -1 && i.targetPct > 0)
      .sort((a, b) => a.deltaPct - b.deltaPct);

    let tip = null;
    if (underweightCategories.length > 0) {
      const targetCat = underweightCategories[0];
      const gapUah = Math.round(
        (Math.abs(targetCat.deltaPct) / 100) * totalCapitalUah
      );
      tip = {
        name: targetCat.label,
        gapPct: Math.abs(targetCat.deltaPct).toFixed(1),
        suggestedAmount: gapUah,
      };
    }

    return { allocationList: list, rebalancingTip: tip };
  }, [categoryTotals, totalCapitalUah, targetAllocation]);

  return (
    <div className="flex flex-col justify-between rounded-2xl border border-slate-800/80 bg-slate-900/60 p-6 shadow-xl backdrop-blur-xl">
      <div>
        {/* Шапка картки */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/60 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-500/20 bg-cyan-500/10 text-cyan-400">
              <Scale className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-100">
                Алокація капіталу & Ребалансування
              </h3>
              <p className="text-xs text-slate-400">
                Розподіл за класами активів та валютами
              </p>
            </div>
          </div>

          {/* Кнопка швидкого доступу до Окупності речей */}
          {onOpenCostPerUse && (
            <button
              onClick={onOpenCostPerUse}
              className="flex items-center gap-1.5 rounded-xl border border-slate-700/80 bg-slate-800/60 px-3 py-1.5 text-xs font-medium text-slate-300 transition-all hover:border-slate-600 hover:bg-slate-800 hover:text-white active:scale-95"
              title="Відкрити окупність речей (Cost-per-Use)"
            >
              <TrendingDown className="h-4 w-4 text-cyan-400" />
              <span>Окупність речей</span>
              {costPerUseItemCount > 0 && (
                <span className="py-0.2 rounded-full bg-cyan-500/20 px-1.5 text-[10px] font-bold text-cyan-300">
                  {costPerUseItemCount}
                </span>
              )}
            </button>
          )}
        </div>

        {/* Перемикач інвестиційної стратегії */}
        <div className="mt-4 flex items-center justify-between">
          <span className="text-xs font-medium text-slate-400">
            Цільовий профіль:
          </span>
          <div className="flex rounded-xl border border-slate-800 bg-slate-950/40 p-0.5">
            {[
              { id: "balanced", label: "Збалансований" },
              { id: "conservative", label: "Консервативний" },
              { id: "growth", label: "Зростання" },
            ].map((p) => (
              <button
                key={p.id}
                onClick={() => setStrategy(p.id as StrategyPreset)}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-all ${
                  strategy === p.id
                    ? "bg-slate-800 text-cyan-300 shadow-sm"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Загальний стек-бар активів */}
        {totalCapitalUah > 0 && (
          <div className="mt-4">
            <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-800 p-0.5">
              {allocationList.map((item) => (
                <div
                  key={item.catKey}
                  style={{ width: `${item.actualPct}%` }}
                  className={`h-full ${item.color} transition-all duration-500 first:rounded-l-full last:rounded-r-full`}
                  title={`${item.label}: ${item.actualPct.toFixed(1)}%`}
                />
              ))}
            </div>
          </div>
        )}

        {/* Список класів активів: Факт vs Таргет */}
        <div className="mt-4 max-h-[220px] space-y-2.5 overflow-y-auto pr-1">
          {allocationList.map((item) => {
            const isUnder = item.deltaPct < -2 && item.targetPct > 0;
            const isOver = item.deltaPct > 2 && item.targetPct > 0;

            return (
              <div
                key={item.catKey}
                className="flex items-center justify-between rounded-xl border border-slate-800/60 bg-slate-800/20 px-3 py-2 text-xs"
              >
                <div className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${item.color}`} />
                  <div>
                    <span className="font-medium text-slate-200">
                      {item.label}
                    </span>
                    <div className="text-[11px] text-slate-400">
                      {Math.round(item.amountUah).toLocaleString("uk-UA")} ₴
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <div className="font-semibold text-slate-100">
                    {item.actualPct.toFixed(1)}%{" "}
                    <span className="text-[11px] font-normal text-slate-400">
                      (ціль {item.targetPct}%)
                    </span>
                  </div>

                  {item.targetPct > 0 && (
                    <span
                      className={`text-[10px] font-medium ${
                        isUnder
                          ? "text-amber-400"
                          : isOver
                            ? "text-cyan-400"
                            : "text-emerald-400"
                      }`}
                    >
                      {item.deltaPct > 0 ? "+" : ""}
                      {item.deltaPct.toFixed(1)}%
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Підказка з ребалансування (Smart Action) */}
        {rebalancingTip && (
          <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
            <div>
              <span className="font-semibold text-amber-300">
                Куди інвестувати наступні кошти?
              </span>
              <p className="mt-0.5 text-slate-300">
                Клас{" "}
                <strong className="text-white">{rebalancingTip.name}</strong>{" "}
                відстає від цільової стратегії на{" "}
                <span className="font-semibold text-amber-400">
                  -{rebalancingTip.gapPct}%
                </span>
                . Вільні кошти (~
                {rebalancingTip.suggestedAmount.toLocaleString("uk-UA")} ₴)
                рекомендовано спрямувати сюди для відновлення балансу.
              </p>
            </div>
          </div>
        )}

        {!rebalancingTip && totalCapitalUah > 0 && (
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs text-emerald-300">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
            <span>
              Портфель чудово збалансований згідно з обраною стратегією!
            </span>
          </div>
        )}

        {/* Валютна диверсифікація */}
        {totalCapitalUah > 0 && (
          <div className="mt-4 border-t border-slate-800/60 pt-3">
            <div className="mb-1.5 flex items-center justify-between text-[11px] text-slate-400">
              <span>Валютна диверсифікація:</span>
              <div className="flex gap-2">
                {Object.entries(currencyTotals)
                  .filter(([_, amt]) => amt > 0)
                  .map(([cur, amt]) => {
                    const pct = ((amt / totalCapitalUah) * 100).toFixed(0);
                    return (
                      <span key={cur} className="font-medium text-slate-300">
                        {cur}: {pct}%
                      </span>
                    );
                  })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});
