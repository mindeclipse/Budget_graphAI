"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Loader2, CheckCircle2, Plus } from "lucide-react";
import { SavingsGoal } from "@/types/finance";
import { parseFlexibleNumber } from "@/lib/normalize";

export interface SavingsGoalFormModalProps {
  isOpen: boolean;
  goal?: SavingsGoal | null;
  onClose: () => void;
  onRefresh: () => void | Promise<void>;
}

export function SavingsGoalFormModal({
  isOpen,
  goal,
  onClose,
  onRefresh,
}: SavingsGoalFormModalProps) {
  const [mounted, setMounted] = useState(false);
  const isEditing = Boolean(goal);

  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [current, setCurrent] = useState("");
  const [currency, setCurrency] = useState("UAH");
  const [targetDate, setTargetDate] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    if (goal) {
      setName(goal.name);
      setTarget(goal.target_amount ? String(goal.target_amount) : "");
      setCurrent(String(goal.current_amount || 0));
      setCurrency(goal.currency || "UAH");
      setTargetDate(goal.target_date ? goal.target_date.substring(0, 10) : "");
    } else {
      setName("");
      setTarget("");
      setCurrent("");
      setCurrency("UAH");
      setTargetDate("");
    }
    setError("");
  }, [isOpen, goal]);

  if (!mounted || !isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Введіть назву скарбнички");
      return;
    }

    const currentVal = parseFlexibleNumber(current);
    if (isNaN(currentVal) || currentVal < 0) {
      setError("Некоректна сума збережень");
      return;
    }

    let targetVal: number | null = null;
    if (target.trim()) {
      const parsedTarget = parseFlexibleNumber(target);
      if (isNaN(parsedTarget) || parsedTarget <= 0) {
        setError("Цільова сума має бути більшою за 0");
        return;
      }
      targetVal = parsedTarget;
    }

    setIsSubmitting(true);
    setError("");

    try {
      if (isEditing && goal) {
        const res = await fetch("/api/savings-goals", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: goal.id,
            name: name.trim(),
            target_amount: targetVal,
            current_amount: currentVal,
            currency,
            target_date: targetDate || null,
          }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Не вдалося оновити скарбничку");
        }
      } else {
        const res = await fetch("/api/savings-goals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            target_amount: targetVal,
            current_amount: currentVal,
            currency,
            target_date: targetDate || null,
          }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Не вдалося створити скарбничку");
        }
      }

      onClose();
      await onRefresh();
    } catch (err: any) {
      setError(err.message || "Помилка збереження скарбнички");
    } finally {
      setIsSubmitting(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />

      <div className="relative z-10 flex max-h-[90dvh] min-h-[60vh] w-full max-w-md flex-col overscroll-contain rounded-t-[28px] border border-zinc-800 bg-zinc-950 shadow-2xl duration-200 sm:max-h-[85vh] sm:min-h-0 sm:rounded-3xl">
        {/* Mobile handle indicator */}
        <div className="mx-auto mt-3 h-1.5 w-11 shrink-0 rounded-full bg-zinc-700/50 sm:hidden" />

        <div className="flex items-center justify-between border-b border-zinc-800/80 px-6 py-4">
          <h4 className="text-base font-semibold text-white">
            {isEditing ? "Редагувати скарбничку" : "Нова ціль заощаджень"}
          </h4>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-800 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
            {error && (
              <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-2.5 text-xs text-rose-400">
                {error}
              </p>
            )}

            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-300">
                {isEditing ? "Назва" : "Назва цілі"}
              </label>
              <input
                type="text"
                required
                placeholder="наприклад Подушка безпеки або Скарбничка"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setError("");
                }}
                className="w-full rounded-xl border border-zinc-700/80 bg-zinc-900 px-3.5 py-2.5 text-sm text-white focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-zinc-300">
                  {isEditing ? "Накопичено (сума)" : "Вже є (початкова)"}
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  required
                  placeholder="0"
                  value={current}
                  onChange={(e) => {
                    setCurrent(e.target.value);
                    setError("");
                  }}
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
                  value={target}
                  onChange={(e) => {
                    setTarget(e.target.value);
                    setError("");
                  }}
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
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
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
                  value={targetDate}
                  onChange={(e) => setTargetDate(e.target.value)}
                  className="w-full rounded-xl border border-zinc-700/80 bg-zinc-900 px-3 py-2.5 text-sm text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div className="flex gap-3 border-t border-zinc-800/80 px-6 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:pb-4">
            <button
              type="button"
              onClick={onClose}
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
              ) : isEditing ? (
                <CheckCircle2 size={14} />
              ) : (
                <Plus size={14} />
              )}
              {isEditing ? "Зберегти" : "Створити"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
