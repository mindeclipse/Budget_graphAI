"use client";

import { useState, useMemo, memo } from "react";
import {
  TrendingUp,
  Plus,
  ArrowUpRight,
  ArrowDownRight,
  Percent,
  Calendar,
  Trash2,
  Edit2,
  PieChart,
} from "lucide-react";
import { InvestmentAsset } from "@/types/finance";
import { parseFlexibleNumber } from "@/lib/normalize";
import { convertToUah } from "@/lib/portfolio-analytics";
import {
  InvestmentAssetModal,
  parseDateInputToIso,
  formatIsoToDisplayDate,
} from "@/components/dashboard/modals/InvestmentAssetModal";

export { parseFlexibleNumber, parseDateInputToIso, formatIsoToDisplayDate };

interface InvestmentsCardProps {
  investments: InvestmentAsset[];
  rates?: { USD: number; EUR: number; PLN: number };
  onRefresh: () => void | Promise<void>;
}

export const ASSET_TYPE_LABELS: Record<
  string,
  { label: string; color: string }
> = {
  bonds: { label: "ОВДП", color: "bg-indigo-500" },
  stocks: { label: "Акції / ETF", color: "bg-sky-500" },
  reit: { label: "REIT", color: "bg-teal-500" },
  crypto: { label: "Крипта", color: "bg-amber-500" },
  deposit: { label: "Депозит", color: "bg-emerald-500" },
  other: { label: "Інше", color: "bg-purple-500" },
};

export const ASSET_TYPE_ORDER: Record<string, number> = {
  bonds: 1,
  stocks: 2,
  reit: 3,
  crypto: 4,
  deposit: 5,
  other: 6,
};

/**
 * Сортує інвестиційні активи за типом та фінансовою логікою:
 * 1. Тип активу (ОВДП -> Акції/ETF -> REIT -> Крипта -> Депозити -> Інше)
 * 2. Для активів з датою погашення (ОВДП, строкові депозити) — за зростанням дати (найближчі до погашення перші)
 * 3. Без дати або з однаковою датою — за поточною вартістю спаданням (найбільші позиції вище)
 * 4. За назвою активу (українська локаль)
 */
export function sortInvestments(assets: InvestmentAsset[]): InvestmentAsset[] {
  return [...assets].sort((a, b) => {
    // 1. Сортування за типом активу
    const orderA = ASSET_TYPE_ORDER[a.asset_type] ?? 99;
    const orderB = ASSET_TYPE_ORDER[b.asset_type] ?? 99;
    if (orderA !== orderB) {
      return orderA - orderB;
    }

    // 2. В межах одного типу: дата погашення (найближчі перші)
    if (a.maturity_date && b.maturity_date) {
      const timeA = new Date(a.maturity_date).getTime();
      const timeB = new Date(b.maturity_date).getTime();
      if (timeA !== timeB) return timeA - timeB;
    } else if (a.maturity_date && !b.maturity_date) {
      return -1;
    } else if (!a.maturity_date && b.maturity_date) {
      return 1;
    }

    // 3. За поточною вартістю спаданням
    const curA = Number(a.current_value) || 0;
    const curB = Number(b.current_value) || 0;
    if (Math.abs(curB - curA) > 0.01) {
      return curB - curA;
    }

    // 4. За назвою активу
    return (a.asset_name || "").localeCompare(b.asset_name || "", "uk-UA");
  });
}

export const InvestmentsCard = memo(function InvestmentsCard({
  investments,
  rates = { USD: 41.5, EUR: 45.3, PLN: 10.6 },
  onRefresh,
}: InvestmentsCardProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [assetToEdit, setAssetToEdit] = useState<InvestmentAsset | null>(null);

  // Сортований список активів
  const sortedInvestments = useMemo(() => {
    return sortInvestments(investments);
  }, [investments]);

  // Підрахунок загального капіталу інвестицій у гривні
  const { totalInvestedUah, totalPortfolioUah, profitUah, profitPercent } =
    useMemo(() => {
      let inv = 0;
      let cur = 0;
      investments.forEach((asset) => {
        inv += convertToUah(asset.invested_amount, asset.currency, rates);
        cur += convertToUah(asset.current_value, asset.currency, rates);
      });
      const prof = cur - inv;
      const pct = inv > 0 ? (prof / inv) * 100 : 0;
      return {
        totalInvestedUah: inv,
        totalPortfolioUah: cur,
        profitUah: prof,
        profitPercent: pct,
      };
    }, [investments, rates]);

  // Розподіл активів за типами
  const typeDistribution = useMemo(() => {
    const dist: Record<string, number> = {};
    investments.forEach((asset) => {
      const uah = convertToUah(asset.current_value, asset.currency, rates);
      dist[asset.asset_type] = (dist[asset.asset_type] || 0) + uah;
    });
    return dist;
  }, [investments, rates]);

  const handleDeleteAsset = async (id: number) => {
    if (!confirm("Видалити цей інвестиційний актив?")) return;
    try {
      const res = await fetch(`/api/investments?id=${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Помилка видалення");
      await onRefresh();
    } catch (err) {
      console.error("Помилка видалення активу:", err);
    }
  };

  const openCreateModal = () => {
    setAssetToEdit(null);
    setIsModalOpen(true);
  };

  const openEditModal = (asset: InvestmentAsset) => {
    setAssetToEdit(asset);
    setIsModalOpen(true);
  };

  return (
    <div className="rounded-3xl border border-zinc-800/80 bg-zinc-900/50 p-4 shadow-xl backdrop-blur-md sm:p-5">
      {/* Заголовок */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-indigo-500/20 bg-indigo-500/10 text-indigo-400">
            <TrendingUp size={20} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">
              Інвестиційний портфель
            </h3>
            <p className="text-xs text-zinc-400">
              ОВДП, акції/ETF, REIT, крипта та депозити
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={openCreateModal}
          className="flex items-center gap-1.5 rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-3 py-1.5 text-xs font-semibold text-indigo-400 transition-colors hover:bg-indigo-500/20"
        >
          <Plus size={14} />
          <span>Новий актив</span>
        </button>
      </div>

      {/* Головні цифри портфеля */}
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
                profitUah >= 0
                  ? "border border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                  : "border border-rose-500/20 bg-rose-500/10 text-rose-400"
              }`}
            >
              {profitUah >= 0 ? (
                <ArrowUpRight size={14} />
              ) : (
                <ArrowDownRight size={14} />
              )}
              <span>
                {profitUah >= 0 ? "+" : ""}
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
                const cfg =
                  ASSET_TYPE_LABELS[typeKey] || ASSET_TYPE_LABELS.other;

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
                const cfg =
                  ASSET_TYPE_LABELS[typeKey] || ASSET_TYPE_LABELS.other;

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

      {/* Список активів */}
      {investments.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-800 p-6 text-center text-xs text-zinc-500">
          У вас ще немає доданих інвестиційних активів. Додайте ваші ОВДП,
          акції/ETF, REIT, криптовалюту чи банківські депозити.
        </div>
      ) : (
        <div className="space-y-2.5">
          {sortedInvestments.map((asset) => {
            const investedVal = Number(asset.invested_amount) || 0;
            const currentVal = Number(asset.current_value) || 0;
            const diff = currentVal - investedVal;
            const pct =
              investedVal > 0 ? ((diff / investedVal) * 100).toFixed(1) : "0";
            const isProfit = diff >= 0;
            const cfg =
              ASSET_TYPE_LABELS[asset.asset_type] || ASSET_TYPE_LABELS.other;

            return (
              <div
                key={asset.id}
                className="group flex items-center justify-between rounded-2xl border border-zinc-800/80 bg-zinc-950/40 p-3 transition-colors hover:border-zinc-700/80"
              >
                <div className="min-w-0 pr-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-block rounded-md px-1.5 py-0.5 text-[9px] font-bold text-white uppercase ${cfg.color}`}
                    >
                      {cfg.label}
                    </span>
                    <h4 className="truncate text-xs font-bold text-white">
                      {asset.asset_name}
                    </h4>
                  </div>

                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-zinc-400">
                    <span>
                      Поточна:{" "}
                      <strong className="text-zinc-200">
                        {currentVal.toLocaleString()} {asset.currency}
                      </strong>
                    </span>
                    {asset.yield_percent && (
                      <span className="flex items-center gap-0.5 font-medium text-emerald-400">
                        <Percent size={10} /> {asset.yield_percent}%
                      </span>
                    )}
                    {asset.maturity_date && (
                      <span className="flex items-center gap-0.5 text-zinc-500">
                        <Calendar size={10} />{" "}
                        {new Date(asset.maturity_date).toLocaleDateString(
                          "uk-UA"
                        )}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2.5">
                  <div className="text-right">
                    <div
                      className={`text-xs font-bold tabular-nums ${
                        isProfit ? "text-emerald-400" : "text-rose-400"
                      }`}
                    >
                      {isProfit ? "+" : ""}
                      {diff.toFixed(0)} {asset.currency}
                    </div>
                    <div className="text-[10px] text-zinc-500">
                      {isProfit ? "+" : ""}
                      {pct}%
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => openEditModal(asset)}
                      className="rounded-lg p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
                      title="Редагувати актив"
                    >
                      <Edit2 size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteAsset(asset.id)}
                      className="rounded-lg p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-rose-400"
                      title="Видалити актив"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Модалка додавання / редагування активу */}
      <InvestmentAssetModal
        isOpen={isModalOpen}
        asset={assetToEdit}
        onClose={() => {
          setIsModalOpen(false);
          setAssetToEdit(null);
        }}
        onRefresh={onRefresh}
      />
    </div>
  );
});
