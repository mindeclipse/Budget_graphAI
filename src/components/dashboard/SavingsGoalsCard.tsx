"use client";

import { useState } from "react";
import {
  PiggyBank,
  Plus,
  TrendingUp,
  ShieldCheck,
  Calendar,
  X,
  Trash2,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import { SavingsGoal } from "@/types/finance";

interface SavingsGoalsCardProps {
  goals: SavingsGoal[];
  monthlyBurnRate?: number;
  onRefresh: () => void | Promise<void>;
}

export function SavingsGoalsCard({
  goals,
  monthlyBurnRate = 35000,
  onRefresh,
}: SavingsGoalsCardProps) {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [depositGoalId, setDepositGoalId] = useState<number | null>(null);
  const [depositAmount, setDepositAmount] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Стейт нової цілі
  const [newName, setNewName] = useState("");
  const [newTarget, setNewTarget] = useState("");
  const [newCurrent, setNewCurrent] = useState("");
  const [newTargetDate, setNewTargetDate] = useState("");
  const [newCurrency, setNewCurrency] = useState("UAH");

  // Розрахунок загальних накопичень у гривні (орієнтовно)
  const totalSaved = goals.reduce(
    (acc, g) => acc + (Number(g.current_amount) || 0),
    0
  );
  const totalTarget = goals.reduce(
    (acc, g) => acc + (Number(g.target_amount) || 0),
    0
  );
  const overallProgress =
    totalTarget > 0
      ? Math.min(Math.round((totalSaved / totalTarget) * 100), 100)
      : 0;

  // Runway: скільки місяців життя покривають накопичення
  const safeBurn = monthlyBurnRate > 0 ? monthlyBurnRate : 30000;
  const runwayMonths = (totalSaved / safeBurn).toFixed(1);

  const handleCreateGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newTarget || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/savings-goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          target_amount: parseFloat(newTarget),
          current_amount: newCurrent ? parseFloat(newCurrent) : 0,
          currency: newCurrency,
          target_date: newTargetDate || null,
        }),
      });

      if (!res.ok) throw new Error("Помилка створення цілі");

      setNewName("");
      setNewTarget("");
      setNewCurrent("");
      setNewTargetDate("");
      setIsAddModalOpen(false);
      await onRefresh();
    } catch (err) {
      console.error(err);
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
          onClick={() => setIsAddModalOpen(true)}
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
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-xl font-extrabold text-white tabular-nums">
              {totalSaved.toLocaleString()}
            </span>
            <span className="text-xs font-semibold text-zinc-400">₴</span>
          </div>
          <p className="mt-0.5 text-[10px] text-zinc-500">
            {overallProgress}% від цілей ({totalTarget.toLocaleString()} ₴)
          </p>
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
            const target = Number(goal.target_amount) || 1;
            const pct = Math.min(Math.round((current / target) * 100), 100);

            return (
              <div
                key={goal.id}
                className="group relative rounded-2xl border border-zinc-800/80 bg-zinc-950/40 p-3.5 transition-colors hover:border-zinc-700/80"
              >
                <div className="mb-2 flex items-start justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-white">
                      {goal.name}
                    </h4>
                    {goal.target_date && (
                      <div className="mt-0.5 flex items-center gap-1 text-[10px] text-zinc-400">
                        <Calendar size={10} />
                        до{" "}
                        {new Date(goal.target_date).toLocaleDateString("uk-UA")}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setDepositGoalId(goal.id)}
                      className="rounded-lg bg-emerald-500/10 px-2 py-1 text-[11px] font-bold text-emerald-400 transition-colors hover:bg-emerald-500/20 active:scale-95"
                    >
                      + Поповнити
                    </button>
                    <button
                      onClick={() => handleDeleteGoal(goal.id)}
                      className="text-zinc-600 opacity-0 transition-opacity group-hover:opacity-100 hover:text-rose-400"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                {/* Прогрес бар */}
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
              </div>
            );
          })}
        </div>
      )}

      {/* Модалка поповнення скарбнички */}
      {depositGoalId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-3xl border border-zinc-800 bg-zinc-950 p-5 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-sm font-bold text-white">
                Поповнити скарбничку
              </h4>
              <button
                onClick={() => setDepositGoalId(null)}
                className="text-zinc-500 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleDeposit} className="space-y-3">
              <div>
                <label className="mb-1 block text-xs text-zinc-400">
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
                  className="w-full rounded-xl border border-zinc-700/80 bg-zinc-900 px-3.5 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div className="flex gap-2">
                {[500, 1000, 2000, 5000].map((quick) => (
                  <button
                    key={quick}
                    type="button"
                    onClick={() => setDepositAmount(String(quick))}
                    className="flex-1 rounded-lg border border-zinc-800 bg-zinc-900 py-1.5 text-[11px] font-medium text-zinc-300 hover:border-zinc-700"
                  >
                    +{quick}
                  </button>
                ))}
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setDepositGoalId(null)}
                  className="flex-1 rounded-xl border border-zinc-800 py-2 text-xs font-semibold text-zinc-400 hover:bg-zinc-900"
                >
                  Скасувати
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 py-2 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <CheckCircle2 size={13} />
                  )}
                  Поповнити
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Модалка створення нової цілі */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-3xl border border-zinc-800 bg-zinc-950 p-5 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-sm font-bold text-white">
                Нова ціль заощаджень
              </h4>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-zinc-500 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleCreateGoal} className="space-y-3">
              <div>
                <label className="mb-1 block text-xs text-zinc-400">
                  Назва цілі
                </label>
                <input
                  type="text"
                  required
                  placeholder="наприклад Подушка безпеки"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full rounded-xl border border-zinc-700/80 bg-zinc-900 px-3.5 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-xs text-zinc-400">
                    Цільова сума
                  </label>
                  <input
                    type="number"
                    step="any"
                    required
                    placeholder="100000"
                    value={newTarget}
                    onChange={(e) => setNewTarget(e.target.value)}
                    className="w-full rounded-xl border border-zinc-700/80 bg-zinc-900 px-3 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-zinc-400">
                    Вже є (початкова)
                  </label>
                  <input
                    type="number"
                    step="any"
                    placeholder="0"
                    value={newCurrent}
                    onChange={(e) => setNewCurrent(e.target.value)}
                    className="w-full rounded-xl border border-zinc-700/80 bg-zinc-900 px-3 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-xs text-zinc-400">
                    Валюта
                  </label>
                  <select
                    value={newCurrency}
                    onChange={(e) => setNewCurrency(e.target.value)}
                    className="w-full rounded-xl border border-zinc-700/80 bg-zinc-900 px-3 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
                  >
                    <option value="UAH">UAH (₴)</option>
                    <option value="USD">USD ($)</option>
                    <option value="EUR">EUR (€)</option>
                    <option value="PLN">PLN (zł)</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-zinc-400">
                    Дедлайн (опціонально)
                  </label>
                  <input
                    type="date"
                    value={newTargetDate}
                    onChange={(e) => setNewTargetDate(e.target.value)}
                    className="w-full rounded-xl border border-zinc-700/80 bg-zinc-900 px-3 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="flex-1 rounded-xl border border-zinc-800 py-2 text-xs font-semibold text-zinc-400 hover:bg-zinc-900"
                >
                  Скасувати
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 py-2 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <Plus size={13} />
                  )}
                  Створити
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
