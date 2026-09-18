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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      {/* Підкладка для закриття кліком */}
      <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />

      {/* Адаптивна шторка для iPhone / Центрована картка для десктопу */}
      <div className="relative z-10 flex max-h-[88vh] min-h-0 w-full max-w-lg flex-col overscroll-contain rounded-t-[28px] border border-zinc-800 bg-zinc-950 p-5 pt-3 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl sm:max-h-[85vh] sm:rounded-3xl sm:p-6 sm:pb-6">
        {/* Grabber Bar для iOS */}
        <div className="mx-auto mb-3 h-1.5 w-11 shrink-0 rounded-full bg-zinc-700/50 sm:hidden" />

        {/* Заголовок модалки */}
        <div className="mb-4 flex items-center justify-between border-b border-zinc-800/80 pb-3.5">
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
              style={{
                backgroundColor: `${color}20`,
                color: color,
              }}
            >
              <IconComponent size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">{categoryName}</h2>
              <p className="font-mono text-xs text-zinc-400 tabular-nums">
                Всього:{" "}
                <strong className="font-semibold text-zinc-100">
                  {totalAmount.toLocaleString("uk-UA", {
                    minimumFractionDigits: 2,
                  })}{" "}
                  ₴
                </strong>{" "}
                <span className="text-zinc-600">•</span>{" "}
                {categoryTransactions.length} оп.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900/60 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white active:scale-95"
          >
            <X size={16} />
          </button>
        </div>

        {/* Список транзакцій із ізольованим overscroll */}
        <div className="flex-1 [scrollbar-width:thin] space-y-2 overflow-y-auto overscroll-contain pr-1">
          {categoryTransactions.length === 0 ? (
            <div className="py-12 text-center text-zinc-600">
              <Receipt size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-xs">У цій категорії ще немає транзакцій</p>
            </div>
          ) : (
            categoryTransactions.map((tx) => (
              <div
                key={tx.id}
                onClick={() => onSelectTransaction?.(tx)}
                className={`group flex items-center justify-between rounded-xl border border-zinc-800/70 bg-zinc-900/30 p-3 transition-all ${
                  onSelectTransaction
                    ? "cursor-pointer hover:border-zinc-700/80 hover:bg-zinc-900/70 active:scale-[0.99]"
                    : ""
                }`}
              >
                <div className="min-w-0 pr-3">
                  <p className="truncate text-xs font-medium text-zinc-200 group-hover:text-white">
                    {tx.merchant_raw}
                  </p>
                  <p className="font-mono text-[10px] text-zinc-500">
                    {formatDateTime(tx.created_at)}
                  </p>
                </div>

                <div className="shrink-0 text-right">
                  <span className="font-mono text-xs font-semibold whitespace-nowrap text-white tabular-nums">
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
