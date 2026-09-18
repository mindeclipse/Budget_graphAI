"use client";

import React from "react";
import { Wallet, TrendingUp } from "lucide-react";
import { triggerHaptic } from "@/lib/haptics";

interface ReceiptTypeSelectorProps {
  editType: "expense" | "investment";
  onChangeType: (type: "expense" | "investment") => void;
}

export const ReceiptTypeSelector: React.FC<ReceiptTypeSelectorProps> = ({
  editType,
  onChangeType,
}) => {
  return (
    <div>
      <label className="mb-1.5 block text-[11px] font-medium text-zinc-400">
        Куди зарахувати операцію?
      </label>
      <div className="grid grid-cols-2 gap-2 rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-1">
        <button
          type="button"
          onClick={() => {
            onChangeType("expense");
            triggerHaptic("selection");
          }}
          className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition-all ${
            editType === "expense"
              ? "bg-rose-500/20 text-rose-300 shadow-sm"
              : "text-zinc-400 hover:text-white"
          }`}
        >
          <Wallet size={14} />
          <span>💸 Витрата (бюджет)</span>
        </button>
        <button
          type="button"
          onClick={() => {
            onChangeType("investment");
            triggerHaptic("selection");
          }}
          className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition-all ${
            editType === "investment"
              ? "bg-emerald-500/20 text-emerald-300 shadow-sm"
              : "text-zinc-400 hover:text-white"
          }`}
        >
          <TrendingUp size={14} />
          <span>📈 Інвестиція / Капітал</span>
        </button>
      </div>
    </div>
  );
};
