"use client";

import React from "react";
import { Check, AlertCircle } from "lucide-react";
import { SplitBalanceIndicatorProps } from "./types";

export const SplitBalanceIndicator = React.memo(function SplitBalanceIndicator({
  isBalanced,
  diff,
  currentSum,
  totalAmount,
}: SplitBalanceIndicatorProps) {
  return (
    <div
      className={`mb-4 flex items-center justify-between rounded-2xl border p-3 text-xs ${
        isBalanced
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
          : "border-amber-500/30 bg-amber-500/10 text-amber-300"
      }`}
    >
      <div className="flex items-center gap-2">
        {isBalanced ? <Check size={16} /> : <AlertCircle size={16} />}
        <span>
          {isBalanced
            ? "Сума частин точно відповідає чеку"
            : diff > 0
              ? `Залишилось розподілити: ${diff.toFixed(2)} ₴`
              : `Перевищення суми на: ${Math.abs(diff).toFixed(2)} ₴`}
        </span>
      </div>
      <span className="font-mono font-bold tabular-nums">
        {currentSum.toFixed(2)} / {totalAmount.toFixed(2)} ₴
      </span>
    </div>
  );
});
