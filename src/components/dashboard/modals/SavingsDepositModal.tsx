"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Loader2, CheckCircle2 } from "lucide-react";
import { SavingsGoal } from "@/types/finance";

export interface SavingsDepositModalProps {
  goal: SavingsGoal | null;
  onClose: () => void;
  onRefresh: () => void | Promise<void>;
}

export function SavingsDepositModal({
  goal,
  onClose,
  onRefresh,
}: SavingsDepositModalProps) {
  const [mounted, setMounted] = useState(false);
  const [depositAmount, setDepositAmount] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !goal) return null;

  const handleDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!depositAmount) return;
    const addVal = parseFloat(depositAmount);
    if (isNaN(addVal) || addVal <= 0) return;

    setIsSubmitting(true);
    try {
      const newAmount = (Number(goal.current_amount) || 0) + addVal;

      const res = await fetch("/api/savings-goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "deposit",
          goal_id: goal.id,
          amount: addVal,
        }),
      });

      if (!res.ok) throw new Error("Помилка поповнення");

      setDepositAmount("");
      onClose();
      await onRefresh();
    } catch (err) {
      console.error("Помилка поповнення скарбнички:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />

      <div className="relative z-10 flex max-h-[90dvh] min-h-[42vh] w-full max-w-md flex-col overscroll-contain rounded-t-[28px] border border-zinc-800 bg-zinc-950 shadow-2xl duration-200 sm:max-h-[85vh] sm:min-h-0 sm:rounded-3xl">
        {/* Mobile handle indicator */}
        <div className="mx-auto mt-3 h-1.5 w-11 shrink-0 rounded-full bg-zinc-700/50 sm:hidden" />

        <div className="flex items-center justify-between border-b border-zinc-800/80 px-6 py-4">
          <div>
            <h4 className="text-base font-semibold text-white">
              Поповнити скарбничку
            </h4>
            <p className="text-xs text-zinc-400">{goal.name}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
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
                Сума поповнення ({goal.currency})
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
  );
}
