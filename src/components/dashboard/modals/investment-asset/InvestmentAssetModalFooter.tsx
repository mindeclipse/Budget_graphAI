"use client";

import React from "react";
import { Loader2, CheckCircle2, Plus } from "lucide-react";

interface InvestmentAssetModalFooterProps {
  onClose: () => void;
  isSubmitting: boolean;
  isEditing: boolean;
}

export const InvestmentAssetModalFooter: React.FC<
  InvestmentAssetModalFooterProps
> = ({ onClose, isSubmitting, isEditing }) => {
  return (
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
        className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-indigo-600 py-2.5 text-xs font-semibold text-white hover:bg-indigo-500 active:scale-95 disabled:opacity-50"
      >
        {isSubmitting ? (
          <Loader2 size={14} className="animate-spin" />
        ) : isEditing ? (
          <CheckCircle2 size={14} />
        ) : (
          <Plus size={14} />
        )}
        {isEditing ? "Зберегти" : "Додати"}
      </button>
    </div>
  );
};
