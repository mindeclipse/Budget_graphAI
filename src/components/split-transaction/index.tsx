"use client";

import React, { useState, useEffect, useCallback } from "react";
import { X, Plus, Split, Loader2 } from "lucide-react";
import { SplitItem, SplitTransactionModalProps } from "./types";
import { SplitBalanceIndicator } from "./SplitBalanceIndicator";
import { SplitItemRow } from "./SplitItemRow";

export * from "./types";
export * from "./SplitBalanceIndicator";
export * from "./SplitItemRow";

export function SplitTransactionModal({
  transaction,
  onClose,
  onSplitSuccess,
}: SplitTransactionModalProps) {
  const [items, setItems] = useState<SplitItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (transaction) {
      const half = (Number(transaction.amount) / 2).toFixed(2);
      const rem = (Number(transaction.amount) - Number(half)).toFixed(2);

      setItems([
        {
          amount: half,
          category_name: transaction.category_name || "Продукти",
          merchant_raw: transaction.merchant_raw,
        },
        {
          amount: rem,
          category_name: "Інше",
          merchant_raw: transaction.merchant_raw,
        },
      ]);
      setErrorMsg(null);
    }
  }, [transaction]);

  const totalAmount = Number(transaction?.amount) || 0;
  const currentSum = items.reduce(
    (acc, it) => acc + (parseFloat(it.amount) || 0),
    0
  );
  const diff = Number((totalAmount - currentSum).toFixed(2));
  const isBalanced = Math.abs(diff) < 0.01;

  const handleAddItem = useCallback(() => {
    if (!transaction) return;
    setItems((prev) => [
      ...prev,
      {
        amount: diff > 0 ? diff.toFixed(2) : "0",
        category_name: "Інше",
        merchant_raw: transaction.merchant_raw,
      },
    ]);
  }, [diff, transaction]);

  const handleRemoveItem = useCallback((index: number) => {
    setItems((prev) => {
      if (prev.length <= 2) return prev;
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  const handleUpdateItem = useCallback(
    (index: number, field: keyof SplitItem, value: string) => {
      setItems((prev) =>
        prev.map((it, i) => (i === index ? { ...it, [field]: value } : it))
      );
    },
    []
  );

  const handleSubmit = async () => {
    if (!transaction || !isBalanced || isSubmitting) return;

    // Валідація значень
    for (const it of items) {
      const val = parseFloat(it.amount);
      if (isNaN(val) || val <= 0) {
        setErrorMsg("Кожна частина повинна мати суму більше 0");
        return;
      }
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const payload = {
        parent_transaction_id: transaction.id,
        items: items.map((it) => ({
          amount: parseFloat(it.amount),
          category_name: it.category_name,
          merchant_raw: it.merchant_raw.trim() || transaction.merchant_raw,
        })),
      };

      const res = await fetch("/api/transactions/split", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Не вдалося розділити транзакцію");
      }

      onSplitSuccess();
      onClose();
    } catch (err: any) {
      console.error("Split error:", err);
      setErrorMsg(err.message || "Сталася помилка при збереженні спліту");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!transaction) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="fixed inset-0" onClick={onClose} />

      <div className="relative z-10 flex max-h-[90vh] min-h-0 w-full max-w-lg flex-col overscroll-contain rounded-t-[28px] border border-zinc-800 bg-zinc-950 p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl sm:rounded-3xl sm:p-6 sm:pb-6">
        <div className="mx-auto mb-3 h-1.5 w-11 shrink-0 rounded-full bg-zinc-700/50 sm:hidden" />

        {/* Заголовок */}
        <div className="mb-4 flex items-center justify-between border-b border-zinc-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-500/10 text-sky-400">
              <Split size={18} />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Розділити чек</h3>
              <p className="text-xs text-zinc-400">
                Оригінальна сума:{" "}
                <span className="font-semibold text-white">
                  {totalAmount.toFixed(2)} ₴
                </span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-xl bg-zinc-900 text-zinc-400 hover:text-white"
          >
            <X size={16} />
          </button>
        </div>

        {/* Індикатор балансу */}
        <SplitBalanceIndicator
          isBalanced={isBalanced}
          diff={diff}
          currentSum={currentSum}
          totalAmount={totalAmount}
        />

        {errorMsg && (
          <div className="mb-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-2.5 text-xs text-rose-300">
            {errorMsg}
          </div>
        )}

        {/* Список частин */}
        <div className="min-h-0 flex-1 [scrollbar-width:thin] space-y-3 overflow-y-auto overscroll-contain pr-1">
          {items.map((item, idx) => (
            <SplitItemRow
              key={idx}
              item={item}
              index={idx}
              canDelete={items.length > 2}
              onRemove={handleRemoveItem}
              onUpdate={handleUpdateItem}
            />
          ))}

          <button
            type="button"
            onClick={handleAddItem}
            className="flex w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-zinc-800 py-2.5 text-xs font-semibold text-zinc-400 hover:border-zinc-700 hover:text-white active:scale-95"
          >
            <Plus size={14} /> Додати ще одну категорію
          </button>
        </div>

        {/* Кнопки дій */}
        <div className="mt-4 flex shrink-0 gap-2 border-t border-zinc-800/80 pt-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-2xl border border-zinc-800 bg-zinc-900 py-2.5 text-xs font-semibold text-zinc-400 hover:bg-zinc-800"
          >
            Скасувати
          </button>
          <button
            type="button"
            disabled={!isBalanced || isSubmitting}
            onClick={handleSubmit}
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-sky-600 py-2.5 text-xs font-bold text-white transition-all hover:bg-sky-500 disabled:opacity-50"
          >
            {isSubmitting ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Split size={14} />
            )}
            Підтвердити спліт
          </button>
        </div>
      </div>
    </div>
  );
}
