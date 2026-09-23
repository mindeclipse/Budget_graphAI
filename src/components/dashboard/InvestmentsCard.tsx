"use client";

import { useState, useMemo, memo } from "react";
import { TrendingUp, Plus, Archive } from "lucide-react";
import { InvestmentAsset } from "@/types/finance";
import { parseFlexibleNumber } from "@/lib/normalize";
import { convertToUah } from "@/lib/portfolio-analytics";
import {
  InvestmentAssetModal,
  parseDateInputToIso,
  formatIsoToDisplayDate,
} from "@/components/dashboard/modals/InvestmentAssetModal";
import { ArchivedBondsModal } from "@/components/dashboard/modals/ArchivedBondsModal";
import {
  InvestmentsCardProps,
  ASSET_TYPE_LABELS,
  ASSET_TYPE_ORDER,
  sortInvestments,
  calculateTotalCoupons,
  isAssetArchived,
  calculateAssetPnl,
  PortfolioSummaryHeader,
  InvestmentAssetsList,
} from "./investments";

export {
  parseFlexibleNumber,
  parseDateInputToIso,
  formatIsoToDisplayDate,
  sortInvestments,
  calculateTotalCoupons,
  isAssetArchived,
  calculateAssetPnl,
  ASSET_TYPE_LABELS,
  ASSET_TYPE_ORDER,
};

export const InvestmentsCard = memo(function InvestmentsCard({
  investments,
  rates = { USD: 44.0, EUR: 48.0, PLN: 11.0 },
  onRefresh,
  onUpsertOptimistic,
  onDeleteOptimistic,
}: InvestmentsCardProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isArchiveOpen, setIsArchiveOpen] = useState(false);
  const [assetToEdit, setAssetToEdit] = useState<InvestmentAsset | null>(null);

  // Сортований список активів
  const sortedInvestments = useMemo(() => {
    return sortInvestments(investments);
  }, [investments]);

  // Розділення на активні та архівні (погашені) активи
  const { activeInvestments, archivedInvestments } = useMemo(() => {
    const active: InvestmentAsset[] = [];
    const archived: InvestmentAsset[] = [];
    sortedInvestments.forEach((asset) => {
      if (isAssetArchived(asset)) {
        archived.push(asset);
      } else {
        active.push(asset);
      }
    });
    return { activeInvestments: active, archivedInvestments: archived };
  }, [sortedInvestments]);

  // Підрахунок загального капіталу активних інвестицій у гривні
  // Поточна вартість (тіло) залишається незмінною, а купони додаються до загального прибутку
  const { totalInvestedUah, totalPortfolioUah, profitUah, profitPercent } =
    useMemo(() => {
      let inv = 0;
      let cur = 0;
      let couponsTotal = 0;

      activeInvestments.forEach((asset) => {
        inv += convertToUah(asset.invested_amount, asset.currency, rates);
        cur += convertToUah(asset.current_value, asset.currency, rates);
        const couponsVal = calculateTotalCoupons(asset);
        if (couponsVal > 0) {
          couponsTotal += convertToUah(couponsVal, asset.currency, rates);
        }
      });

      const prof = cur + couponsTotal - inv;
      const pct = inv > 0 ? (prof / inv) * 100 : 0;
      return {
        totalInvestedUah: inv,
        totalPortfolioUah: cur,
        profitUah: prof,
        profitPercent: pct,
      };
    }, [activeInvestments, rates]);

  // Розподіл активів за типами (лише активні позиції)
  const typeDistribution = useMemo(() => {
    const dist: Record<string, number> = {};
    activeInvestments.forEach((asset) => {
      const uah = convertToUah(asset.current_value, asset.currency, rates);
      dist[asset.asset_type] = (dist[asset.asset_type] || 0) + uah;
    });
    return dist;
  }, [activeInvestments, rates]);

  const handleDeleteAsset = async (id: number) => {
    if (!confirm("Видалити цей інвестиційний актив?")) return;
    onDeleteOptimistic?.(id);
    try {
      const res = await fetch(`/api/investments?id=${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Помилка видалення");
      await onRefresh();
    } catch (err) {
      console.error("Помилка видалення активу:", err);
      await onRefresh();
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

        <div className="flex items-center gap-2">
          {/* Кнопка Архіву погашених ОВДП / активів */}
          <button
            type="button"
            onClick={() => setIsArchiveOpen(true)}
            className="flex items-center gap-1.5 rounded-xl border border-zinc-700/80 bg-zinc-800/50 px-2.5 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:border-zinc-600 hover:text-white"
            title="Архів погашених ОВДП та активів"
          >
            <Archive size={14} className="text-zinc-400" />
            <span className="hidden sm:inline">Архів</span>
            {archivedInvestments.length > 0 && (
              <span className="py-0.2 rounded-full bg-zinc-700 px-1.5 text-[10px] font-semibold text-zinc-200">
                {archivedInvestments.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={openCreateModal}
            className="flex items-center gap-1.5 rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-3 py-1.5 text-xs font-semibold text-indigo-400 transition-colors hover:bg-indigo-500/20"
          >
            <Plus size={14} />
            <span>Новий актив</span>
          </button>
        </div>
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
        assets={activeInvestments}
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
        onUpsertOptimistic={onUpsertOptimistic}
      />

      {/* Модалка архіву погашених активів */}
      <ArchivedBondsModal
        isOpen={isArchiveOpen}
        onClose={() => setIsArchiveOpen(false)}
        archivedAssets={archivedInvestments}
        onRefresh={onRefresh}
        onUpsertOptimistic={onUpsertOptimistic}
        onDeleteOptimistic={onDeleteOptimistic}
      />
    </div>
  );
});
