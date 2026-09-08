"use client";

import { useEffect } from "react";
import { X, HelpCircle, Receipt } from "lucide-react";
import { Transaction } from "@/types/finance";
import { CATEGORY_ICONS, CATEGORY_COLORS } from "@/constants/categories";

interface CategoryDetailModalProps {
  categoryName: string | null;
  transactions: Transaction[];
  onClose: () => void;
  onSelectTransaction?: (transaction: Transaction) => void;
}

export function CategoryDetailModal({
  categoryName,
  transactions,
  onClose,
  onSelectTransaction,
}: CategoryDetailModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (categoryName) {
      window.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "unset";
    };
  }, [categoryName, onClose]);

  if (!categoryName) return null;

  const categoryTransactions = transactions
    .filter((t) => t.category_name === categoryName)
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

  const totalAmount = categoryTransactions.reduce(
    (sum, t) => sum + Number(t.amount || 0),
    0
  );

  const IconComponent = CATEGORY_ICONS[categoryName] || HelpCircle;
  const color = CATEGORY_COLORS[categoryName] || "#71717A";

  const formatDateTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return new Intl.DateTimeFormat("uk-UA", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />

      <div className="relative z-10 flex max-h-[85vh] w-full max-w-lg flex-col rounded-t-3xl border border-zinc-800 bg-zinc-950 p-5 shadow-2xl sm:rounded-3xl">
        {/* Заголовок модалки */}
        <div className="mb-4 flex items-center justify-between border-b border-zinc-800/80 pb-4">
          <div className="flex items-center gap-3">
            <div
              className="rounded-xl p-2.5"
              style={{
                backgroundColor: `${color}20`,
                color: color,
              }}
            >
              <IconComponent size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">{categoryName}</h2>
              <p className="text-xs text-zinc-400">
                Всього витрат:{" "}
                <strong className="text-zinc-200">
                  {totalAmount.toLocaleString("uk-UA", {
                    minimumFractionDigits: 2,
                  })}{" "}
                  ₴
                </strong>{" "}
                • {categoryTransactions.length} оп.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="rounded-xl p-2 text-zinc-400 transition-colors hover:bg-zinc-900 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        {/* Список транзакцій */}
        <div className="flex-1 space-y-2 overflow-y-auto pr-1">
          {categoryTransactions.length === 0 ? (
            <div className="py-12 text-center text-zinc-600">
              <Receipt size={32} className="mx-auto mb-2 opacity-40" />
              <p className="text-sm">Транзакцій у цій категорії немає</p>
            </div>
          ) : (
            categoryTransactions.map((tx) => (
              <div
                key={tx.id}
                onClick={() => onSelectTransaction?.(tx)}
                className={`group flex items-center justify-between rounded-xl border border-zinc-800/60 bg-zinc-900/40 p-3 transition-all ${
                  onSelectTransaction
                    ? "cursor-pointer hover:border-zinc-700 hover:bg-zinc-900/80 active:scale-[0.99]"
                    : ""
                }`}
              >
                <div className="min-w-0 pr-3">
                  <p className="truncate text-sm font-semibold text-zinc-100 group-hover:text-white">
                    {tx.merchant_raw}
                  </p>
                  <p className="font-mono text-[11px] text-zinc-500">
                    {formatDateTime(tx.created_at)}
                  </p>
                </div>

                <div className="shrink-0 text-right">
                  <span className="text-sm font-bold whitespace-nowrap text-white">
                    -{Number(tx.amount).toFixed(2)} ₴
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
