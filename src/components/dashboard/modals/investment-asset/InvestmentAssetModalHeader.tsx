"use client";

import React from "react";
import { X } from "lucide-react";

interface InvestmentAssetModalHeaderProps {
  isEditing: boolean;
  onClose: () => void;
}

export const InvestmentAssetModalHeader: React.FC<
  InvestmentAssetModalHeaderProps
> = ({ isEditing, onClose }) => {
  return (
    <>
      {/* Mobile handle indicator */}
      <div className="mx-auto mt-3 h-1.5 w-11 shrink-0 rounded-full bg-zinc-700/50 sm:hidden" />

      <div className="flex items-center justify-between border-b border-zinc-800/80 px-6 py-4">
        <h4 className="text-base font-semibold text-white">
          {isEditing ? "Редагувати актив" : "Новий інвестиційний актив"}
        </h4>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-800 hover:text-white"
        >
          <X size={18} />
        </button>
      </div>
    </>
  );
};
