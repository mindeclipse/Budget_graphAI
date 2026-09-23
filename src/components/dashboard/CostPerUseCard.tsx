"use client";

import { useState, memo } from "react";
import { Plus, TrendingDown } from "lucide-react";
import { CostPerUseCardProps } from "./cost-per-use/types";
import { CostPerUseSavedBanner } from "./cost-per-use/CostPerUseSavedBanner";
import { CostPerUseItemRow } from "./cost-per-use/CostPerUseItemRow";
import { AddCostPerUseModal } from "./modals/AddCostPerUseModal";

export type { CostPerUseCardProps };

export const CostPerUseCard = memo(function CostPerUseCard({
  items,
  totalMoneySaved = 0,
  onRefresh,
  prefillItem = null,
  onClearPrefill,
  onAddOptimistic,
  onIncrementOptimistic,
  onDeleteOptimistic,
}: CostPerUseCardProps) {
  const [isAddModalOpen, setIsAddModalOpen] = useState(Boolean(prefillItem));
  const [loggingId, setLoggingId] = useState<number | null>(null);

  // Підрахунок сумарної економії та вкладень
  const computedSaved = items.reduce((acc, item) => {
    const uses = Math.max(1, item.total_uses || 1);
    if (
      item.benchmark_cost_per_use &&
      Number(item.benchmark_cost_per_use) > 0
    ) {
      const benchmarkTotal = Number(item.benchmark_cost_per_use) * uses;
      return acc + Math.max(0, benchmarkTotal - Number(item.purchase_price));
    }
    return acc;
  }, 0);

  const finalSaved = totalMoneySaved || Math.round(computedSaved);

  const handleLogUse = async (id: number) => {
    setLoggingId(id);
    onIncrementOptimistic?.(id);
    try {
      const res = await fetch("/api/cost-per-use", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "log_use", increment: 1 }),
      });
      if (!res.ok) throw new Error("Помилка оновлення");
      await onRefresh();
    } catch (err) {
      console.error(err);
      await onRefresh();
    } finally {
      setLoggingId(null);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Ви дійсно хочете видалити цей актив із трекера?")) return;
    onDeleteOptimistic?.(id);
    try {
      const res = await fetch(`/api/cost-per-use?id=${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Помилка видалення");
      await onRefresh();
    } catch (err) {
      console.error(err);
      await onRefresh();
    }
  };

  const handleCloseModal = () => {
    setIsAddModalOpen(false);
    if (onClearPrefill) onClearPrefill();
  };

  return (
    <div className="flex flex-col justify-between rounded-2xl border border-slate-800/80 bg-slate-900/60 p-6 shadow-xl backdrop-blur-xl">
      <div>
        {/* Заголовок */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/60 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-500/20 bg-cyan-500/10 text-cyan-400">
              <TrendingDown className="h-5 w-5" />
            </div>
            <div>
              <h3 className="flex items-center gap-2 text-base font-semibold text-slate-100">
                Окупність речей (Cost-per-Use)
              </h3>
              <p className="text-xs text-slate-400">
                Вартість за 1 використання зменшується щодня
              </p>
            </div>
          </div>

          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-1.5 rounded-xl bg-cyan-600 px-3.5 py-2 text-xs font-medium text-white shadow-lg shadow-cyan-600/20 transition-all hover:bg-cyan-500 active:scale-95"
          >
            <Plus className="h-4 w-4" />
            Додати річ
          </button>
        </div>

        {/* Банер сумарної економії */}
        <CostPerUseSavedBanner
          finalSaved={finalSaved}
          itemCount={items.length}
        />

        {/* Список речей на обліку */}
        <div className="mt-4 max-h-[430px] space-y-3 overflow-y-auto pr-1">
          {items.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500">
              Ще немає речей на обліку. Додайте кофемашину, куртку чи робочі
              інструменти!
            </div>
          ) : (
            items.map((item) => (
              <CostPerUseItemRow
                key={item.id}
                item={item}
                isLogging={loggingId === item.id}
                onLogUse={handleLogUse}
                onDelete={handleDelete}
              />
            ))
          )}
        </div>
      </div>

      {/* Модальне вікно додавання нової речі */}
      <AddCostPerUseModal
        isOpen={isAddModalOpen}
        onClose={handleCloseModal}
        onSuccess={onRefresh}
        prefillItem={prefillItem}
        onAddOptimistic={onAddOptimistic}
      />
    </div>
  );
});
