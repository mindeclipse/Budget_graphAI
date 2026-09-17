"use client";

import { useState, memo } from "react";
import {
  PiggyBank,
  Plus,
  TrendingUp,
  ShieldCheck,
  Calendar,
  Trash2,
  Pencil,
  Infinity as InfinityIcon,
} from "lucide-react";
import { SavingsGoal } from "@/types/finance";
import { convertToUah } from "@/lib/portfolio-analytics";
import { SavingsDepositModal } from "@/components/dashboard/modals/SavingsDepositModal";
import { SavingsGoalFormModal } from "@/components/dashboard/modals/SavingsGoalFormModal";

export { convertToUah };

export const CURRENCY_SYMBOLS: Record<string, string> = {
  UAH: "₴",
  USD: "$",
  EUR: "€",
  PLN: "zł",
};

export interface CurrencyTotalInfo {
  current: number;
  target: number;
  hasTarget: boolean;
}

export interface SavingsMetrics {
  totalSavedUahEquivalent: number;
  totalTargetUahEquivalent: number;
  hasAnyTarget: boolean;
  totalPercent: number;
  runwayMonths: string;
  currencyTotals: Record<string, CurrencyTotalInfo>;
  activeCurrencies: string[];
}

export function calculateSavingsMetrics(
  goals: SavingsGoal[],
  monthlyBurnRate: number = 35000,
  rates: { USD: number; EUR: number; PLN: number } = {
    USD: 41.5,
    EUR: 45.3,
    PLN: 10.6,
  }
): SavingsMetrics {
  let totalSavedUahEquivalent = 0;
  let totalTargetUahEquivalent = 0;
  let hasAnyTarget = false;

  const currencyTotals: Record<string, CurrencyTotalInfo> = {};

  goals.forEach((goal) => {
    const cur = (goal.currency || "UAH").toUpperCase();
    const currentAmt = Number(goal.current_amount) || 0;
    const targetAmt = Number(goal.target_amount) || 0;
    const hasTarget = targetAmt > 0;

    if (!currencyTotals[cur]) {
      currencyTotals[cur] = { current: 0, target: 0, hasTarget: false };
    }
    currencyTotals[cur].current += currentAmt;
    if (hasTarget) {
      currencyTotals[cur].target += targetAmt;
      currencyTotals[cur].hasTarget = true;
      hasAnyTarget = true;
    }

    totalSavedUahEquivalent += convertToUah(currentAmt, cur, rates);
    if (hasTarget) {
      totalTargetUahEquivalent += convertToUah(targetAmt, cur, rates);
    }
  });

  const totalPercent =
    hasAnyTarget && totalTargetUahEquivalent > 0
      ? Math.min(
          100,
          Math.round((totalSavedUahEquivalent / totalTargetUahEquivalent) * 100)
        )
      : 0;

  const runwayMonths =
    monthlyBurnRate > 0
      ? (totalSavedUahEquivalent / monthlyBurnRate).toFixed(1)
      : "0";

  return {
    totalSavedUahEquivalent,
    totalTargetUahEquivalent,
    hasAnyTarget,
    totalPercent,
    runwayMonths,
    currencyTotals,
    activeCurrencies: Object.keys(currencyTotals).sort(),
  };
}

interface SavingsGoalsCardProps {
  goals: SavingsGoal[];
  monthlyBurnRate?: number;
  rates?: { USD: number; EUR: number; PLN: number };
  onRefresh: () => void | Promise<void>;
}

export const SavingsGoalsCard = memo(function SavingsGoalsCard({
  goals,
  monthlyBurnRate = 35000,
  rates = { USD: 41.5, EUR: 45.3, PLN: 10.6 },
  onRefresh,
}: SavingsGoalsCardProps) {
  const [goalToDeposit, setGoalToDeposit] = useState<SavingsGoal | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [goalToEdit, setGoalToEdit] = useState<SavingsGoal | null>(null);

  const metrics = calculateSavingsMetrics(goals, monthlyBurnRate, rates);

  const handleDeleteGoal = async (id: number) => {
    if (!confirm("Видалити цю ціль заощаджень?")) return;
    try {
      const res = await fetch(`/api/savings-goals?id=${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Помилка видалення");
      await onRefresh();
    } catch (err) {
      console.error(err);
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
      <div className="mb-5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {/* Загальний капітал заощаджень */}
        <div className="rounded-2xl border border-zinc-800/60 bg-zinc-950/40 p-3">
          <div className="flex items-center justify-between text-[11px] text-zinc-400">
            <span>Всього в скарбничках</span>
            <ShieldCheck size={14} className="text-emerald-400" />
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-base font-extrabold text-white tabular-nums sm:text-lg">
              {Math.round(metrics.totalSavedUahEquivalent).toLocaleString()} ₴
            </span>
            {metrics.hasAnyTarget && (
              <span className="text-xs font-medium text-zinc-500 tabular-nums">
                /{" "}
                {Math.round(metrics.totalTargetUahEquivalent).toLocaleString()}{" "}
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

      {/* Список цілей */}
      {goals.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-800 p-6 text-center text-xs text-zinc-500">
          У вас ще немає створених цілей заощаджень. Додайте подушку безпеки або
          скарбничку на велику покупку.
        </div>
      ) : (
        <div className="space-y-3">
          {goals.map((goal) => {
            const current = Number(goal.current_amount) || 0;
            const target = Number(goal.target_amount) || 0;
            const hasTarget = target > 0;
            const percent = hasTarget
              ? Math.min(100, Math.round((current / target) * 100))
              : 0;

            return (
              <div
                key={goal.id}
                className="group rounded-2xl border border-zinc-800/80 bg-zinc-950/40 p-3.5 transition-colors hover:border-zinc-700/80"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="text-xs font-bold text-white sm:text-sm">
                      {goal.name}
                    </h4>
                    {goal.target_date && (
                      <p className="mt-0.5 flex items-center gap-1 text-[10px] text-zinc-500">
                        <Calendar size={11} />
                        Дедлайн:{" "}
                        {new Date(goal.target_date).toLocaleDateString("uk-UA")}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setGoalToDeposit(goal)}
                      className="rounded-lg bg-emerald-500/10 px-2 py-1 text-[11px] font-semibold text-emerald-400 hover:bg-emerald-500/20"
                    >
                      + Поповнити
                    </button>
                    <button
                      type="button"
                      onClick={() => openEditModal(goal)}
                      className="rounded-lg p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
                      title="Редагувати ціль"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteGoal(goal.id)}
                      className="rounded-lg p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-rose-400"
                      title="Видалити ціль"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                {hasTarget ? (
                  <div className="mt-2.5">
                    <div className="mb-1 flex items-baseline justify-between text-xs">
                      <span className="font-extrabold text-white tabular-nums">
                        {current.toLocaleString()}{" "}
                        <span className="text-[11px] font-semibold text-emerald-400">
                          {CURRENCY_SYMBOLS[goal.currency] || goal.currency}
                        </span>
                      </span>
                      <span className="text-[11px] font-medium text-zinc-500 tabular-nums">
                        з {target.toLocaleString()}{" "}
                        {CURRENCY_SYMBOLS[goal.currency] || goal.currency} (
                        {percent}%)
                      </span>
                    </div>

                    <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-900">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-teal-400 transition-all duration-500"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="mt-2.5 flex items-center justify-between border-t border-zinc-800/40 pt-2">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-xs font-medium text-zinc-400">
                        Накопичено:
                      </span>
                      <span className="text-sm font-extrabold text-white tabular-nums">
                        {current.toLocaleString()}{" "}
                        <span className="text-xs font-semibold text-emerald-400">
                          {CURRENCY_SYMBOLS[goal.currency] || goal.currency}
                        </span>
                      </span>
                      {goal.currency !== "UAH" && (
                        <span className="text-[11px] text-zinc-500 tabular-nums">
                          (≈{" "}
                          {Math.round(
                            convertToUah(current, goal.currency, rates)
                          ).toLocaleString()}{" "}
                          ₴)
                        </span>
                      )}
                    </div>

                    <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                      <InfinityIcon size={12} />
                      <span>
                        {goal.target_date ? "Без ліміту" : "Безстроково"}
                      </span>
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Модальні вікна */}
      <SavingsDepositModal
        goal={goalToDeposit}
        onClose={() => setGoalToDeposit(null)}
        onRefresh={onRefresh}
      />

      <SavingsGoalFormModal
        isOpen={isFormOpen}
        goal={goalToEdit}
        onClose={() => {
          setIsFormOpen(false);
          setGoalToEdit(null);
        }}
        onRefresh={onRefresh}
      />
    </div>
  );
});
