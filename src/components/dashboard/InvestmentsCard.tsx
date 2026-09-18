"use client";

import { useState, useMemo, memo } from "react";
import { TrendingUp, Plus } from "lucide-react";
import { InvestmentAsset } from "@/types/finance";
import { parseFlexibleNumber } from "@/lib/normalize";
import { convertToUah } from "@/lib/portfolio-analytics";
import {
  InvestmentAssetModal,
  parseDateInputToIso,
  formatIsoToDisplayDate,
} from "@/components/dashboard/modals/InvestmentAssetModal";
import {
  InvestmentsCardProps,
  ASSET_TYPE_LABELS,
  ASSET_TYPE_ORDER,
  sortInvestments,
  PortfolioSummaryHeader,
  InvestmentAssetsList,
} from "./investments";

export {
  parseFlexibleNumber,
  parseDateInputToIso,
  formatIsoToDisplayDate,
  sortInvestments,
  ASSET_TYPE_LABELS,
  ASSET_TYPE_ORDER,
};

export const InvestmentsCard = memo(function InvestmentsCard({
  investments,
  rates = { USD: 44.0, EUR: 48.0, PLN: 11.0 },
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
      <PortfolioSummaryHeader
        totalPortfolioUah={totalPortfolioUah}
        totalInvestedUah={totalInvestedUah}
        profitUah={profitUah}
        profitPercent={profitPercent}
        typeDistribution={typeDistribution}
      />

      {/* Список активів */}
      <InvestmentAssetsList
        assets={sortedInvestments}
        onEdit={openEditModal}
        onDelete={handleDeleteAsset}
      />

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
