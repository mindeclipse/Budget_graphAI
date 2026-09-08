"use client";

import { X, Trash2, HelpCircle } from "lucide-react";
import { Transaction } from "@/types/finance";
import {
  CATEGORIES,
  CATEGORY_COLORS,
  CATEGORY_ICONS,
} from "@/constants/categories";

interface TransactionActionSheetProps {
  transaction: Transaction | null;
  onClose: () => void;
  onUpdateCategory: (txId: number, category: string) => Promise<void>;
  onDelete: (txId: number) => Promise<void>;
}

export function TransactionActionSheet({
  transaction,
  onClose,
  onUpdateCategory,
  onDelete,
}: TransactionActionSheetProps) {
  if (!transaction) return null;

  return (
    <div className="animate-in fade-in fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm duration-150 sm:items-center sm:p-4">
      <div
        className="max-h-[85vh] w-full overflow-y-auto rounded-t-3xl border border-zinc-800 bg-zinc-950 p-5 shadow-2xl sm:max-w-md sm:rounded-2xl sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-zinc-700/80 sm:hidden" />

        <div className="mb-5 flex items-start justify-between border-b border-zinc-800/80 pb-4">
          <div>
            <span className="text-xs font-medium tracking-wider text-zinc-400 uppercase">
              Редагування операції
            </span>
            <h3 className="mt-0.5 text-lg font-bold text-white">
              {transaction.merchant_raw}
            </h3>
            <p className="text-xs text-zinc-500">
              {new Date(transaction.created_at).toLocaleString("uk-UA", {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-base font-extrabold text-white">
              -{Number(transaction.amount).toFixed(2)} ₴
            </span>
            <button
              onClick={onClose}
              className="rounded-lg border border-zinc-800 bg-zinc-900 p-1 text-zinc-400 hover:text-white"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="mb-6">
          <p className="mb-2.5 text-xs font-semibold tracking-wider text-zinc-400 uppercase">
            Оберіть правильну категорію
          </p>
          <div className="grid grid-cols-2 gap-2">
            {CATEGORIES.map((catName) => {
              const Icon = CATEGORY_ICONS[catName] || HelpCircle;
              const isCurrent = transaction.category_name === catName;
              const color = CATEGORY_COLORS[catName] || "#6B7280";

              return (
                <button
                  key={catName}
                  onClick={() => onUpdateCategory(transaction.id, catName)}
                  className={`flex items-center space-x-2.5 rounded-xl border p-2.5 text-left text-xs font-medium transition-all ${
                    isCurrent
                      ? "border-zinc-600 bg-zinc-800 text-white shadow-sm"
                      : "border-zinc-800/80 bg-zinc-900/40 text-zinc-300 hover:bg-zinc-900 hover:text-white"
                  }`}
                >
                  <div
                    className="shrink-0 rounded-lg p-1.5"
                    style={{ backgroundColor: `${color}20`, color: color }}
                  >
                    <Icon size={14} />
                  </div>
                  <span className="truncate">{catName}</span>
                </button>
              );
            })}
          </div>
        </div>

        <button
          onClick={() => onDelete(transaction.id)}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-rose-900/50 bg-rose-950/30 py-2.5 text-xs font-semibold text-rose-400 transition-all hover:border-rose-700/80 hover:bg-rose-950/60"
        >
          <Trash2 size={14} />
          Видалити цю транзакцію
        </button>
      </div>
    </div>
  );
}
