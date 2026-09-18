"use client";

import React from "react";
import { Check, Loader2, Split, Trash2 } from "lucide-react";
import { triggerHaptic } from "@/lib/haptics";

interface ActionSheetFooterActionsProps {
  isDirty: boolean;
  isSubmitting: boolean;
  onSave: () => void;
  canSplit: boolean;
  onSplit: () => void;
  isConfirmingDelete: boolean;
  onConfirmDeleteChange: (val: boolean) => void;
  onDelete: () => void;
}

export const ActionSheetFooterActions: React.FC<
  ActionSheetFooterActionsProps
> = ({
  isDirty,
  isSubmitting,
  onSave,
  canSplit,
  onSplit,
  isConfirmingDelete,
  onConfirmDeleteChange,
  onDelete,
}) => {
  return (
    <>
      {/* Кнопка збереження змін форми (якщо змінено назву, форс-мажор, амортизацію або коментар) */}
      {isDirty && (
        <div className="pt-2">
          <button
            type="button"
            onClick={onSave}
            disabled={isSubmitting}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-sky-600 py-3 text-xs font-bold text-white shadow-lg shadow-sky-950/40 transition-all hover:bg-sky-500 active:scale-[0.98] disabled:opacity-50"
          >
            {isSubmitting ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Check size={16} />
            )}
            Зберегти зміни
          </button>
        </div>
      )}

      {/* Розділити транзакцію (якщо це не вже розділена дочірня) */}
      {canSplit && (
        <div className="pt-2">
          <button
            type="button"
            onClick={onSplit}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-sky-500/30 bg-sky-500/10 py-2.5 text-xs font-bold text-sky-400 transition-all hover:bg-sky-500/20 active:scale-[0.99]"
          >
            <Split size={14} /> Розділити на кілька категорій
          </button>
        </div>
      )}

      {/* Видалення транзакції із захистом від випадкового натискання */}
      <div className="pt-2">
        {isConfirmingDelete ? (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                triggerHaptic("selection");
                onConfirmDeleteChange(false);
              }}
              className="flex-1 rounded-2xl border border-zinc-800 bg-zinc-900/80 py-2.5 text-xs font-semibold text-zinc-400 transition-all hover:bg-zinc-800 active:scale-95"
            >
              Скасувати
            </button>
            <button
              type="button"
              onClick={() => {
                triggerHaptic("heavy");
                onDelete();
              }}
              className="flex-1 items-center justify-center gap-1.5 rounded-2xl bg-rose-600 py-2.5 text-xs font-bold text-white shadow-lg shadow-rose-950/40 transition-all hover:bg-rose-500 active:scale-95"
            >
              <Trash2 size={14} className="mr-1 inline" />
              Точно видалити?
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              triggerHaptic("warning");
              onConfirmDeleteChange(true);
            }}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-rose-900/40 bg-rose-950/20 py-2.5 text-xs font-bold text-rose-400 transition-all hover:bg-rose-900/30 active:scale-[0.99]"
          >
            <Trash2 size={14} /> Видалити транзакцію
          </button>
        )}
      </div>
    </>
  );
};
