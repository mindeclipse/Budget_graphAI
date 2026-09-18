"use client";

import React from "react";
import { X } from "lucide-react";
import { Transaction } from "@/types/finance";

interface ActionSheetHeaderProps {
  transaction: Transaction;
  onClose: () => void;
}

export const ActionSheetHeader: React.FC<ActionSheetHeaderProps> = ({
  transaction,
  onClose,
}) => {
  return (
    <>
      {/* Grabber Bar — маркер свайпу для iOS */}
      <div className="mx-auto mb-3.5 h-1.5 w-11 shrink-0 rounded-full bg-zinc-700/50 sm:hidden" />

      {/* Шапка модалки */}
      <div className="mb-4 flex items-start justify-between border-b border-zinc-800/80 pb-3.5">
        <div className="min-w-0 pr-2">
          <span className="text-[10px] font-semibold tracking-wider text-zinc-500 uppercase">
            Редагування чека
          </span>
          <h3 className="truncate text-base font-bold text-white">
            {transaction.merchant_raw}
          </h3>
          <p className="mt-0.5 text-xs text-zinc-400">
            {new Date(transaction.created_at).toLocaleString("uk-UA")} •{" "}
            <strong className="font-mono font-semibold text-emerald-400 tabular-nums">
              {Number(transaction.amount).toFixed(2)} ₴
            </strong>
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-zinc-800/80 bg-zinc-900/60 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white active:scale-95"
        >
          <X size={16} />
        </button>
      </div>
    </>
  );
};
