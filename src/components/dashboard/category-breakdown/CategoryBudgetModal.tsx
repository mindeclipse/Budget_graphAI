"use client";

import React from "react";
import { createPortal } from "react-dom";
import { X, Check, Trash2, Loader2 } from "lucide-react";
import { CategoryBudgetModalProps } from "./types";

export const CategoryBudgetModal = React.memo(function CategoryBudgetModal({
  categoryName,
  categoryBudgets,
  limitInput,
  isSubmitting,
  onLimitInputChange,
  onClose,
  onSave,
  onDelete,
}: CategoryBudgetModalProps) {
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />

      <div className="relative z-10 flex max-h-[90vh] min-h-0 w-full max-w-md flex-col overscroll-contain rounded-t-[28px] border border-zinc-800 bg-zinc-950 shadow-2xl sm:max-h-[85vh] sm:max-w-xs sm:rounded-3xl">
        {/* Mobile handle indicator */}
        <div className="mx-auto mt-3 h-1.5 w-11 shrink-0 rounded-full bg-zinc-700/50 sm:hidden" />

        <div className="flex items-center justify-between border-b border-zinc-800/80 px-5 py-3.5 sm:px-5 sm:py-4">
          <h4 className="text-xs font-bold text-white">
            Ліміт для «{categoryName}»
          </h4>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-500 hover:text-white"
          >
            <X size={15} />
          </button>
        </div>

        <form
          onSubmit={onSave}
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <div className="flex-1 [scrollbar-width:thin] space-y-3 overflow-y-auto overscroll-contain px-5 py-4">
            <div>
              <label className="mb-1 block text-[11px] text-zinc-400">
                Місячний ліміт витрат (₴)
              </label>
              <input
                type="number"
                step="any"
                inputMode="decimal"
                required
                placeholder="наприклад 5000"
                value={limitInput}
                onChange={(e) => onLimitInputChange(e.target.value)}
                className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3.5 py-2.5 text-base text-white focus:border-sky-500 focus:outline-none sm:text-sm"
              />
            </div>

            <div className="flex gap-2">
              {[2000, 5000, 10000].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => onLimitInputChange(String(preset))}
                  className="flex-1 rounded-lg border border-zinc-800 bg-zinc-900 py-1 text-[10px] font-medium text-zinc-300 hover:border-zinc-700"
                >
                  {preset.toLocaleString()} ₴
                </button>
              ))}
            </div>
          </div>

          <div className="flex shrink-0 gap-2 border-t border-zinc-800/80 px-5 py-3.5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:px-5 sm:py-4 sm:pb-4">
            {categoryBudgets[categoryName] && onDelete && (
              <button
                type="button"
                onClick={onDelete}
                disabled={isSubmitting}
                className="flex items-center justify-center rounded-xl border border-rose-900/40 bg-rose-950/20 px-3 py-2 text-xs font-bold text-rose-400 hover:bg-rose-900/30"
              >
                <Trash2 size={13} />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-zinc-800 py-2 text-xs font-semibold text-zinc-400 hover:bg-zinc-900"
            >
              Скасувати
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-sky-600 py-2 text-xs font-bold text-white hover:bg-sky-500 disabled:opacity-50"
            >
              {isSubmitting ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Check size={13} />
              )}
              Зберегти
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
});
