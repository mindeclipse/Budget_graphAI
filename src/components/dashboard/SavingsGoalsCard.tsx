"use client";

import { useState, memo } from "react";
import { PiggyBank, Plus } from "lucide-react";
import { SavingsGoal } from "@/types/finance";
import { SavingsDepositModal } from "@/components/dashboard/modals/SavingsDepositModal";
import { SavingsGoalFormModal } from "@/components/dashboard/modals/SavingsGoalFormModal";
import {
  SavingsGoalsCardProps,
  CURRENCY_SYMBOLS,
  calculateSavingsMetrics,
  convertToUah,
  SavingsMetricsSummary,
  SavingsGoalsList,
} from "./savings-goals";

export { calculateSavingsMetrics, convertToUah, CURRENCY_SYMBOLS };
export type { SavingsMetrics, CurrencyTotalInfo } from "./savings-goals";

export const SavingsGoalsCard = memo(function SavingsGoalsCard({
  goals,
  monthlyBurnRate = 35000,
  rates = { USD: 44.0, EUR: 48.0, PLN: 11.0 },
  onRefresh,
  onDepositOptimistic,
  onUpsertOptimistic,
  onDeleteOptimistic,
}: SavingsGoalsCardProps) {
  const [goalToDeposit, setGoalToDeposit] = useState<SavingsGoal | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [goalToEdit, setGoalToEdit] = useState<SavingsGoal | null>(null);

  const metrics = calculateSavingsMetrics(goals, monthlyBurnRate, rates);

  const handleDeleteGoal = async (id: number) => {
    if (!confirm("Видалити цю ціль заощаджень?")) return;
    onDeleteOptimistic?.(id);
    try {
      const res = await fetch(`/api/savings-goals?id=${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Помилка видалення");
      await onRefresh();
    } catch (err) {
      console.error(err);
      await onRefresh();
    }
  };

  const openCreateModal = () => {
    setGoalToEdit(null);
    setIsFormOpen(true);
  };

  const openEditModal = (goal: SavingsGoal) => {
    setGoalToEdit(goal);
    setIsFormOpen(true);
  };

  return (
    <div className="rounded-3xl border border-zinc-800/80 bg-zinc-900/50 p-4 shadow-xl backdrop-blur-md sm:p-5">
      {/* Заголовок */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-400">
            <PiggyBank size={20} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Цілі заощаджень</h3>
            <p className="text-xs text-zinc-400">
              Подушка безпеки та фінансові плани
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={openCreateModal}
          className="flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-400 transition-colors hover:bg-emerald-500/20"
        >
          <Plus size={14} />
          <span>Нова ціль</span>
        </button>
      </div>

      {/* Метрики картки */}
      <SavingsMetricsSummary
        metrics={metrics}
        monthlyBurnRate={monthlyBurnRate}
      />

      {/* Список цілей */}
      <SavingsGoalsList
        goals={goals}
        rates={rates}
        onDeposit={setGoalToDeposit}
        onEdit={openEditModal}
        onDelete={handleDeleteGoal}
      />

      {/* Модальні вікна */}
      <SavingsDepositModal
        goal={goalToDeposit}
        onClose={() => setGoalToDeposit(null)}
        onRefresh={onRefresh}
        onDepositOptimistic={onDepositOptimistic}
      />

      <SavingsGoalFormModal
        isOpen={isFormOpen}
        goal={goalToEdit}
        onClose={() => {
          setIsFormOpen(false);
          setGoalToEdit(null);
        }}
        onRefresh={onRefresh}
        onUpsertOptimistic={onUpsertOptimistic}
      />
    </div>
  );
});
