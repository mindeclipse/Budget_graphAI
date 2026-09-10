"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  PiggyBank,
  Plus,
  TrendingUp,
  ShieldCheck,
  Calendar,
  X,
  Trash2,
  Pencil,
  Loader2,
  CheckCircle2,
  Infinity as InfinityIcon,
} from "lucide-react";
import { SavingsGoal } from "@/types/finance";
import { parseFlexibleNumber } from "@/lib/normalize";
import { convertToUah } from "@/lib/portfolio-analytics";

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
  currencyTotals: Record<string, CurrencyTotalInfo>;
  activeCurrencies: string[];
  totalSavedUahEquivalent: number;
  runwayMonths: string;
}

export function calculateSavingsMetrics(
  goals: SavingsGoal[],
  monthlyBurnRate: number = 30000,
  rates: { USD: number; EUR: number; PLN: number } = {
    USD: 41.5,
    EUR: 45.3,
    PLN: 10.6,
  }
): SavingsMetrics {
  const currencyTotals: Record<string, CurrencyTotalInfo> = {};

  goals.forEach((g) => {
    const curr = (g.currency || "UAH").toUpperCase();
    if (!currencyTotals[curr]) {
      currencyTotals[curr] = { current: 0, target: 0, hasTarget: false };
    }
    currencyTotals[curr].current += Number(g.current_amount) || 0;
    if (g.target_amount != null && Number(g.target_amount) > 0) {
      currencyTotals[curr].target += Number(g.target_amount);
      currencyTotals[curr].hasTarget = true;
    }
  });

  const activeCurrencies = Object.keys(currencyTotals);

  const totalSavedUahEquivalent = goals.reduce(
    (acc, g) =>
      acc + convertToUah(Number(g.current_amount) || 0, g.currency, rates),
    0
  );

  const safeBurn = monthlyBurnRate > 0 ? monthlyBurnRate : 30000;
  const runwayMonths = (totalSavedUahEquivalent / safeBurn).toFixed(1);

  return {
    currencyTotals,
    activeCurrencies,
    totalSavedUahEquivalent,
    runwayMonths,
  };
}

interface SavingsGoalsCardProps {
  goals: SavingsGoal[];
  monthlyBurnRate?: number;
  rates?: { USD: number; EUR: number; PLN: number };
  onRefresh: () => void | Promise<void>;
}

export function SavingsGoalsCard({
  goals,
  monthlyBurnRate = 35000,
  rates = { USD: 41.5, EUR: 45.3, PLN: 10.6 },
  onRefresh,
}: SavingsGoalsCardProps) {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [depositGoalId, setDepositGoalId] = useState<number | null>(null);
  const [depositAmount, setDepositAmount] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createError, setCreateError] = useState("");

  useEffect(() => {
    setMounted(true);
  }, []);

  // Стейт нової цілі
  const [newName, setNewName] = useState("");
  const [newTarget, setNewTarget] = useState("");
  const [newCurrent, setNewCurrent] = useState("");
  const [newTargetDate, setNewTargetDate] = useState("");
  const [newCurrency, setNewCurrency] = useState("UAH");

  // Стейт редагування цілі
  const [editGoal, setEditGoal] = useState<SavingsGoal | null>(null);
  const [editName, setEditName] = useState("");
  const [editCurrent, setEditCurrent] = useState("");
  const [editTarget, setEditTarget] = useState("");
  const [editCurrency, setEditCurrency] = useState("UAH");
  const [editTargetDate, setEditTargetDate] = useState("");
  const [editError, setEditError] = useState("");

  const metrics = calculateSavingsMetrics(goals, monthlyBurnRate, rates);
  const {
    currencyTotals,
    activeCurrencies,
    totalSavedUahEquivalent,
    runwayMonths,
  } = metrics;
  const safeBurn = monthlyBurnRate > 0 ? monthlyBurnRate : 30000;

  const handleOpenEdit = (goal: SavingsGoal) => {
    setEditGoal(goal);
    setEditName(goal.name);
    setEditCurrent(
      goal.current_amount != null ? String(goal.current_amount) : "0"
    );
    setEditTarget(
      goal.target_amount != null && Number(goal.target_amount) > 0
        ? String(goal.target_amount)
        : ""
    );
    setEditCurrency(goal.currency || "UAH");
    setEditTargetDate(goal.target_date ? goal.target_date.split("T")[0] : "");
    setEditError("");
  };

  const handleCreateGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || isSubmitting) return;

    setIsSubmitting(true);
    setCreateError("");
    try {
      const res = await fetch("/api/savings-goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          target_amount: newTarget.trim()
            ? parseFlexibleNumber(newTarget)
            : null,
          current_amount: newCurrent.trim()
            ? parseFlexibleNumber(newCurrent)
            : 0,
          currency: newCurrency,
          target_date: newTargetDate || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Помилка створення цілі");

      setNewName("");
      setNewTarget("");
      setNewCurrent("");
      setNewTargetDate("");
      setIsAddModalOpen(false);
      await onRefresh();
    } catch (err: any) {
      console.error(err);
      setCreateError(err.message || "Помилка створення цілі");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editGoal || !editName.trim() || isSubmitting) return;

    setIsSubmitting(true);
    setEditError("");
    try {
      const res = await fetch("/api/savings-goals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editGoal.id,
          name: editName.trim(),
          current_amount: editCurrent.trim()
            ? parseFlexibleNumber(editCurrent)
            : 0,
          target_amount: editTarget.trim()
            ? parseFlexibleNumber(editTarget)
            : null,
          currency: editCurrency,
          target_date: editTargetDate || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Помилка оновлення цілі");

      setEditGoal(null);
      await onRefresh();
    } catch (err: any) {
      console.error(err);
      setEditError(err.message || "Не вдалося оновити ціль");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!depositGoalId || !depositAmount || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/savings-goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "deposit",
          goal_id: depositGoalId,
          amount: parseFloat(depositAmount),
        }),
      });

      if (!res.ok) throw new Error("Помилка поповнення цілі");

      setDepositGoalId(null);
      setDepositAmount("");
      await onRefresh();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteGoal = async (id: number) => {
    if (!confirm("Видалити цю ціль заощаджень?")) return;
    try {
      const res = await fetch(`/api/savings-goals?id=${id}`, {
        method: "DELETE",
      });
      if (res.ok) await onRefresh();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="rounded-3xl border border-zinc-800/80 bg-zinc-900/60 p-5 backdrop-blur-xl transition-all">
      {/* Шапка картки */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400">
            <PiggyBank size={20} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Скарбнички та Цілі</h3>
            <p className="text-xs text-zinc-400">Накопичення та Runway</p>
          </div>
        </div>

        <button
          onClick={() => {
            setCreateError("");
            setIsAddModalOpen(true);
          }}
          className="flex items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-800/60 px-3 py-1.5 text-xs font-semibold text-zinc-200 transition-colors hover:bg-zinc-700 hover:text-white active:scale-95"
        >
          <Plus size={14} /> Додати ціль
        </button>
      </div>

      {/* Метрики Runway та Загальних накопичень */}
      <div className="mb-5 grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-zinc-800/80 bg-zinc-950/60 p-3.5">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-400">
            <ShieldCheck size={13} className="text-emerald-400" />
            Фінансовий Runway
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-xl font-extrabold text-white tabular-nums">
              {runwayMonths}
            </span>
            <span className="text-xs font-semibold text-emerald-400">
              міс. життя
            </span>
          </div>
          <p className="mt-0.5 text-[10px] text-zinc-500">
            при спалюванні ~{Math.round(safeBurn).toLocaleString()} ₴/міс
          </p>
        </div>

        <div className="rounded-2xl border border-zinc-800/80 bg-zinc-950/60 p-3.5">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-400">
            <TrendingUp size={13} className="text-sky-400" />
            Всього заощаджено
          </div>

          {activeCurrencies.length === 0 && (
            <>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-xl font-extrabold text-white tabular-nums">
                  0
                </span>
                <span className="text-xs font-semibold text-zinc-400">₴</span>
              </div>
              <p className="mt-0.5 text-[10px] text-zinc-500">0% від цілей</p>
            </>
          )}

          {activeCurrencies.length === 1 &&
            (() => {
              const curr = activeCurrencies[0];
              const info = currencyTotals[curr];
              const pct =
                info.hasTarget && info.target > 0
                  ? Math.min(
                      Math.round((info.current / info.target) * 100),
                      100
                    )
                  : 0;

              return (
                <>
                  <div className="mt-1 flex items-baseline gap-1.5">
                    <span className="text-xl font-extrabold text-white tabular-nums">
                      {info.current.toLocaleString()}
                    </span>
                    <span className="text-xs font-semibold text-zinc-400">
                      {CURRENCY_SYMBOLS[curr] || curr}
                    </span>
                  </div>
                  {info.hasTarget ? (
                    <p className="mt-0.5 text-[10px] text-zinc-500">
                      {pct}% від цілей ({info.target.toLocaleString()}{" "}
                      {CURRENCY_SYMBOLS[curr] || curr})
                    </p>
                  ) : (
                    <p className="mt-0.5 text-[10px] text-zinc-500">
                      Скарбничка без фіксованої мети
                    </p>
                  )}
                </>
              );
            })()}

          {activeCurrencies.length > 1 && (
            <>
              <div className="mt-1 flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
                {activeCurrencies.map((c) => (
                  <div key={c} className="flex items-baseline gap-1">
                    <span className="text-lg font-extrabold text-white tabular-nums">
                      {currencyTotals[c].current.toLocaleString()}
                    </span>
                    <span className="text-xs font-semibold text-zinc-400">
                      {CURRENCY_SYMBOLS[c] || c}
                    </span>
                  </div>
                ))}
              </div>
              <p className="mt-0.5 text-[10px] text-zinc-500">
                ≈ {Math.round(totalSavedUahEquivalent).toLocaleString()} ₴ в
                еквіваленті
              </p>
            </>
          )}
        </div>
      </div>

      {/* Список цілей */}
      {goals.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-800 p-6 text-center text-xs text-zinc-500">
          У вас ще немає створених скарбничок чи цілей заощаджень. Створіть
          першу ціль («Подушка безпеки», «Відпустка», тощо).
        </div>
      ) : (
        <div className="space-y-3">
          {goals.map((goal) => {
            const current = Number(goal.current_amount) || 0;
            const hasTarget =
              goal.target_amount != null && Number(goal.target_amount) > 0;
            const target = hasTarget ? Number(goal.target_amount) : 0;
            const pct = hasTarget
              ? Math.min(Math.round((current / target) * 100), 100)
              : 0;

            return (
              <div
                key={goal.id}
                className="group relative rounded-2xl border border-zinc-800/80 bg-zinc-950/40 p-3.5 transition-colors hover:border-zinc-700/80"
              >
                <div className="mb-2 flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-xs font-bold text-white">
                        {goal.name}
                      </h4>
                      {!hasTarget && (
                        <span className="rounded-md border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-400">
                          Скарбничка
                        </span>
                      )}
                    </div>
                    {goal.target_date && (
                      <div className="mt-0.5 flex items-center gap-1 text-[10px] text-zinc-400">
                        <Calendar size={10} />
                        до{" "}
                        {new Date(goal.target_date).toLocaleDateString("uk-UA")}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setDepositGoalId(goal.id)}
                      className="rounded-lg bg-emerald-500/10 px-2 py-1 text-[11px] font-bold text-emerald-400 transition-colors hover:bg-emerald-500/20 active:scale-95"
                    >
                      + Поповнити
                    </button>
                    <button
                      onClick={() => handleOpenEdit(goal)}
                      className="rounded-lg p-1 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
                      title="Редагувати"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => handleDeleteGoal(goal.id)}
                      className="rounded-lg p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-rose-400"
                      title="Видалити"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                {/* Прогрес бар для цілей або балансовий блок для безстрокових скарбничок */}
                {hasTarget ? (
                  <>
                    <div className="mb-1.5 h-2 w-full overflow-hidden rounded-full bg-zinc-800">
                      <div
                        className="h-full rounded-full bg-linear-to-r from-emerald-500 to-teal-400 transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-mono font-medium text-zinc-300 tabular-nums">
                        {current.toLocaleString()} / {target.toLocaleString()}{" "}
                        {goal.currency}
                      </span>
                      <span className="font-bold text-emerald-400">{pct}%</span>
                    </div>
                  </>
                ) : (
                  <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-800/60 bg-zinc-900/40 px-3 py-2">
                    <div className="flex flex-wrap items-baseline gap-1.5">
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

      {/* Модалка поповнення скарбнички */}
      {depositGoalId !== null &&
        mounted &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 p-0 backdrop-blur-sm sm:items-center sm:p-4">
            <div
              className="fixed inset-0"
              onClick={() => setDepositGoalId(null)}
              aria-hidden="true"
            />

            <div className="relative z-10 flex max-h-[90dvh] min-h-[42vh] w-full max-w-md flex-col overscroll-contain rounded-t-[28px] border border-zinc-800 bg-zinc-950 shadow-2xl duration-200 sm:max-h-[85vh] sm:min-h-0 sm:rounded-3xl">
              {/* Mobile handle indicator */}
              <div className="mx-auto mt-3 h-1.5 w-11 shrink-0 rounded-full bg-zinc-700/50 sm:hidden" />

              <div className="flex items-center justify-between border-b border-zinc-800/80 px-6 py-4">
                <h4 className="text-base font-semibold text-white">
                  Поповнити скарбничку
                </h4>
                <button
                  type="button"
                  onClick={() => setDepositGoalId(null)}
                  className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-800 hover:text-white"
                >
                  <X size={18} />
                </button>
              </div>

              <form
                onSubmit={handleDeposit}
                className="flex min-h-0 flex-1 flex-col overflow-hidden"
              >
                <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-zinc-300">
                      Сума поповнення
                    </label>
                    <input
                      type="number"
                      step="any"
                      autoFocus
                      required
                      placeholder="наприклад 2000"
                      value={depositAmount}
                      onChange={(e) => setDepositAmount(e.target.value)}
                      className="w-full rounded-xl border border-zinc-700/80 bg-zinc-900 px-3.5 py-2.5 text-base font-medium text-white focus:border-emerald-500 focus:outline-none"
                    />
                  </div>

                  <div className="flex gap-2.5">
                    {[500, 1000, 2000, 5000].map((quick) => (
                      <button
                        key={quick}
                        type="button"
                        onClick={() => setDepositAmount(String(quick))}
                        className="flex-1 rounded-xl border border-zinc-800 bg-zinc-900 py-2 text-xs font-medium text-zinc-300 transition-colors hover:border-zinc-700 hover:text-white"
                      >
                        +{quick}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex gap-3 border-t border-zinc-800/80 px-6 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:pb-4">
                  <button
                    type="button"
                    onClick={() => setDepositGoalId(null)}
                    className="flex-1 rounded-xl border border-zinc-800 py-2.5 text-xs font-medium text-zinc-400 hover:bg-zinc-900 hover:text-white"
                  >
                    Скасувати
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 py-2.5 text-xs font-semibold text-white hover:bg-emerald-500 active:scale-95 disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <CheckCircle2 size={14} />
                    )}
                    Поповнити
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}

      {/* Модалка редагування цілі */}
      {editGoal !== null &&
        mounted &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 p-0 backdrop-blur-sm sm:items-center sm:p-4">
            <div
              className="fixed inset-0"
              onClick={() => {
                setEditGoal(null);
                setEditError("");
              }}
              aria-hidden="true"
            />

            <div className="relative z-10 flex max-h-[90dvh] min-h-[60vh] w-full max-w-md flex-col overscroll-contain rounded-t-[28px] border border-zinc-800 bg-zinc-950 shadow-2xl duration-200 sm:max-h-[85vh] sm:min-h-0 sm:rounded-3xl">
              {/* Mobile handle indicator */}
              <div className="mx-auto mt-3 h-1.5 w-11 shrink-0 rounded-full bg-zinc-700/50 sm:hidden" />

              <div className="flex items-center justify-between border-b border-zinc-800/80 px-6 py-4">
                <h4 className="text-base font-semibold text-white">
                  Редагувати скарбничку
                </h4>
                <button
                  type="button"
                  onClick={() => {
                    setEditGoal(null);
                    setEditError("");
                  }}
                  className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-800 hover:text-white"
                >
                  <X size={18} />
                </button>
              </div>

              <form
                onSubmit={handleUpdateGoal}
                className="flex min-h-0 flex-1 flex-col overflow-hidden"
              >
                <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
                  {editError && (
                    <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-2.5 text-xs text-rose-400">
                      {editError}
                    </p>
                  )}

                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-zinc-300">
                      Назва
                    </label>
                    <input
                      type="text"
                      required
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full rounded-xl border border-zinc-700/80 bg-zinc-900 px-3.5 py-2.5 text-sm text-white focus:border-emerald-500 focus:outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-zinc-300">
                        Накопичено (сума)
                      </label>
                      <input
                        type="text"
                        inputMode="decimal"
                        required
                        placeholder="0"
                        value={editCurrent}
                        onChange={(e) => setEditCurrent(e.target.value)}
                        className="w-full rounded-xl border border-zinc-700/80 bg-zinc-900 px-3.5 py-2.5 text-sm text-white focus:border-emerald-500 focus:outline-none"
                      />
                      <p className="mt-1 text-[10px] text-zinc-500">
                        Поточні збереження
                      </p>
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-zinc-300">
                        Цільова сума
                      </label>
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder="Без ліміту"
                        value={editTarget}
                        onChange={(e) => setEditTarget(e.target.value)}
                        className="w-full rounded-xl border border-zinc-700/80 bg-zinc-900 px-3.5 py-2.5 text-sm text-white focus:border-emerald-500 focus:outline-none"
                      />
                      <p className="mt-1 text-[10px] text-zinc-500">
                        Порожнє = безстроково
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-zinc-300">
                        Валюта
                      </label>
                      <select
                        value={editCurrency}
                        onChange={(e) => setEditCurrency(e.target.value)}
                        className="w-full rounded-xl border border-zinc-700/80 bg-zinc-900 px-3 py-2.5 text-sm text-white focus:border-emerald-500 focus:outline-none"
                      >
                        <option value="UAH">UAH (₴)</option>
                        <option value="USD">USD ($)</option>
                        <option value="EUR">EUR (€)</option>
                        <option value="PLN">PLN (zł)</option>
                      </select>
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-zinc-300">
                        Дедлайн (опціонально)
                      </label>
                      <input
                        type="date"
                        value={editTargetDate}
                        onChange={(e) => setEditTargetDate(e.target.value)}
                        className="w-full rounded-xl border border-zinc-700/80 bg-zinc-900 px-3 py-2.5 text-sm text-white focus:border-emerald-500 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 border-t border-zinc-800/80 px-6 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:pb-4">
                  <button
                    type="button"
                    onClick={() => {
                      setEditGoal(null);
                      setEditError("");
                    }}
                    className="flex-1 rounded-xl border border-zinc-800 py-2.5 text-xs font-medium text-zinc-400 hover:bg-zinc-900 hover:text-white"
                  >
                    Скасувати
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 py-2.5 text-xs font-semibold text-white hover:bg-emerald-500 active:scale-95 disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <CheckCircle2 size={14} />
                    )}
                    Зберегти
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}

      {/* Модалка створення нової цілі */}
      {isAddModalOpen &&
        mounted &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 p-0 backdrop-blur-sm sm:items-center sm:p-4">
            <div
              className="fixed inset-0"
              onClick={() => {
                setIsAddModalOpen(false);
                setCreateError("");
              }}
              aria-hidden="true"
            />

            <div className="relative z-10 flex max-h-[90dvh] min-h-[60vh] w-full max-w-md flex-col overscroll-contain rounded-t-[28px] border border-zinc-800 bg-zinc-950 shadow-2xl duration-200 sm:max-h-[85vh] sm:min-h-0 sm:rounded-3xl">
              {/* Mobile handle indicator */}
              <div className="mx-auto mt-3 h-1.5 w-11 shrink-0 rounded-full bg-zinc-700/50 sm:hidden" />

              <div className="flex items-center justify-between border-b border-zinc-800/80 px-6 py-4">
                <h4 className="text-base font-semibold text-white">
                  Нова ціль заощаджень
                </h4>
                <button
                  type="button"
                  onClick={() => {
                    setIsAddModalOpen(false);
                    setCreateError("");
                  }}
                  className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-800 hover:text-white"
                >
                  <X size={18} />
                </button>
              </div>

              <form
                onSubmit={handleCreateGoal}
                className="flex min-h-0 flex-1 flex-col overflow-hidden"
              >
                <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
                  {createError && (
                    <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-2.5 text-xs text-rose-400">
                      {createError}
                    </p>
                  )}

                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-zinc-300">
                      Назва цілі
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="наприклад Подушка безпеки або Скарбничка"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      className="w-full rounded-xl border border-zinc-700/80 bg-zinc-900 px-3.5 py-2.5 text-sm text-white focus:border-emerald-500 focus:outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-zinc-300">
                        Цільова сума (опціонально)
                      </label>
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder="Без обмеження"
                        value={newTarget}
                        onChange={(e) => setNewTarget(e.target.value)}
                        className="w-full rounded-xl border border-zinc-700/80 bg-zinc-900 px-3.5 py-2.5 text-sm text-white focus:border-emerald-500 focus:outline-none"
                      />
                      <p className="mt-1 text-[10px] text-zinc-500">
                        Залиште порожнім для скарбнички без мети
                      </p>
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-zinc-300">
                        Вже є (початкова)
                      </label>
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder="0"
                        value={newCurrent}
                        onChange={(e) => setNewCurrent(e.target.value)}
                        className="w-full rounded-xl border border-zinc-700/80 bg-zinc-900 px-3.5 py-2.5 text-sm text-white focus:border-emerald-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-zinc-300">
                        Валюта
                      </label>
                      <select
                        value={newCurrency}
                        onChange={(e) => setNewCurrency(e.target.value)}
                        className="w-full rounded-xl border border-zinc-700/80 bg-zinc-900 px-3 py-2.5 text-sm text-white focus:border-emerald-500 focus:outline-none"
                      >
                        <option value="UAH">UAH (₴)</option>
                        <option value="USD">USD ($)</option>
                        <option value="EUR">EUR (€)</option>
                        <option value="PLN">PLN (zł)</option>
                      </select>
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-zinc-300">
                        Дедлайн (опціонально)
                      </label>
                      <input
                        type="date"
                        value={newTargetDate}
                        onChange={(e) => setNewTargetDate(e.target.value)}
                        className="w-full rounded-xl border border-zinc-700/80 bg-zinc-900 px-3 py-2.5 text-sm text-white focus:border-emerald-500 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 border-t border-zinc-800/80 px-6 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:pb-4">
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddModalOpen(false);
                      setCreateError("");
                    }}
                    className="flex-1 rounded-xl border border-zinc-800 py-2.5 text-xs font-medium text-zinc-400 hover:bg-zinc-900 hover:text-white"
                  >
                    Скасувати
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 py-2.5 text-xs font-semibold text-white hover:bg-emerald-500 active:scale-95 disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Plus size={14} />
                    )}
                    Створити
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
