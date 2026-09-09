"use client";

import { useState, useEffect } from "react";
import {
  X,
  Plus,
  Trash2,
  Split,
  Check,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { Transaction } from "@/types/finance";
import {
  CATEGORIES,
  CATEGORY_ICONS,
  CATEGORY_COLORS,
} from "@/constants/categories";

interface SplitItem {
  amount: string;
  category_name: string;
  merchant_raw: string;
}

interface SplitTransactionModalProps {
  transaction: Transaction | null;
  onClose: () => void;
  onSplitSuccess: () => void;
}

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

  if (!transaction) return null;

  const totalAmount = Number(transaction.amount) || 0;
  const currentSum = items.reduce(
    (acc, it) => acc + (parseFloat(it.amount) || 0),
    0
  );
  const diff = Number((totalAmount - currentSum).toFixed(2));
  const isBalanced = Math.abs(diff) < 0.01;

  const handleAddItem = () => {
    setItems((prev) => [
      ...prev,
      {
        amount: diff > 0 ? diff.toFixed(2) : "0",
        category_name: "Інше",
        merchant_raw: transaction.merchant_raw,
      },
    ]);
  };

  const handleRemoveItem = (index: number) => {
    if (items.length <= 2) return;
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpdateItem = (
    index: number,
    field: keyof SplitItem,
    value: string
  ) => {
    setItems((prev) =>
      prev.map((it, i) => (i === index ? { ...it, [field]: value } : it))
    );
  };

  const handleSubmit = async () => {
    if (!isBalanced || isSubmitting) return;

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

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="fixed inset-0" onClick={onClose} />

      <div className="relative z-10 flex max-h-[90vh] w-full max-w-lg flex-col rounded-t-[28px] border border-zinc-800 bg-zinc-950 p-5 shadow-2xl sm:rounded-3xl sm:p-6">
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

        {errorMsg && (
          <div className="mb-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-2.5 text-xs text-rose-300">
            {errorMsg}
          </div>
        )}

        {/* Спискок частин */}
        <div className="space-y-3 overflow-y-auto pr-1">
          {items.map((item, idx) => (
            <div
              key={idx}
              className="space-y-2 rounded-2xl border border-zinc-800/80 bg-zinc-900/50 p-3.5"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-zinc-400 uppercase">
                  Частина #{idx + 1}
                </span>
                {items.length > 2 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveItem(idx)}
                    className="text-zinc-500 hover:text-rose-400"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-[10px] text-zinc-500">
                    Сума (₴)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={item.amount}
                    onChange={(e) =>
                      handleUpdateItem(idx, "amount", e.target.value)
                    }
                    placeholder="0.00"
                    className="w-full rounded-xl border border-zinc-700/60 bg-zinc-900 px-3 py-2 text-sm font-semibold text-white focus:border-sky-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-[10px] text-zinc-500">
                    Категорія
                  </label>
                  <select
                    value={item.category_name}
                    onChange={(e) =>
                      handleUpdateItem(idx, "category_name", e.target.value)
                    }
                    className="w-full rounded-xl border border-zinc-700/60 bg-zinc-900 px-2.5 py-2 text-xs font-medium text-white focus:border-sky-500 focus:outline-none"
                  >
                    {CATEGORIES.map((cat) => (
                      <option key={cat} value={cat} className="bg-zinc-900">
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <input
                  type="text"
                  value={item.merchant_raw}
                  onChange={(e) =>
                    handleUpdateItem(idx, "merchant_raw", e.target.value)
                  }
                  placeholder="Опис частини (опціонально)..."
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-950/60 px-3 py-1.5 text-xs text-zinc-300 placeholder-zinc-600 focus:border-zinc-700 focus:outline-none"
                />
              </div>
            </div>
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
        <div className="mt-4 flex gap-2 border-t border-zinc-800/80 pt-3">
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
