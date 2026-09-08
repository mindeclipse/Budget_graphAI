"use client";

import { useState, useEffect } from "react";
import { X, Trash2 } from "lucide-react";
import { RecurringItem } from "@/types/finance";
import { CATEGORIES } from "@/constants/categories";

interface RecurringModalProps {
  isOpen: boolean;
  item: RecurringItem | null;
  onClose: () => void;
  onSave: (data: {
    id?: number;
    title: string;
    amount: number;
    currency: "UAH" | "USD";
    category_name: string;
    day_of_month: number;
  }) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}

export function RecurringModal({
  isOpen,
  item,
  onClose,
  onSave,
  onDelete,
}: RecurringModalProps) {
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<"UAH" | "USD">("UAH");
  const [category, setCategory] = useState<string>("Підписки та сервіси");
  const [day, setDay] = useState("1");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (item) {
      setTitle(item.title);
      setAmount(item.amount.toString());
      setCurrency(item.currency || "UAH");
      setCategory(item.category_name);
      setDay(item.day_of_month.toString());
    } else {
      setTitle("");
      setAmount("");
      setCurrency("UAH");
      setCategory("Підписки та сервіси");
      setDay("1");
    }
  }, [item, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    const parsedAmount = parseFloat(amount);
    if (!title || isNaN(parsedAmount) || parsedAmount <= 0) return;

    setIsSubmitting(true);
    try {
      await onSave({
        id: item?.id,
        title,
        amount: parsedAmount,
        currency,
        category_name: category,
        day_of_month: parseInt(day) || 1,
      });
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm space-y-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-5 shadow-2xl">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <h3 className="text-sm font-bold text-white">
            {item ? "Редагування постійної витрати" : "Новий постійний платіж"}
          </h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-white">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-zinc-400">
              Назва
            </label>
            <input
              type="text"
              placeholder="Оренда, зв'язок, підписка"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-white focus:border-zinc-600 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-zinc-400">
                Сума та валюта
              </label>
              <div className="flex gap-1.5">
                <input
                  type="number"
                  step="any"
                  placeholder="100"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full min-w-0 rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-white focus:border-zinc-600 focus:outline-none"
                />
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value as "UAH" | "USD")}
                  className="rounded-xl border border-zinc-800 bg-zinc-900 px-2 py-2 text-xs font-semibold text-zinc-300 focus:border-zinc-600 focus:outline-none"
                >
                  <option value="UAH">₴</option>
                  <option value="USD">$</option>
                </select>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-semibold text-zinc-400">
                День місяця
              </label>
              <input
                type="number"
                min="1"
                max="31"
                value={day}
                onChange={(e) => setDay(e.target.value)}
                className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-white focus:border-zinc-600 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-semibold text-zinc-400">
              Категорія
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-white focus:border-zinc-600 focus:outline-none"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2 pt-2">
          {item && (
            <button
              onClick={() => onDelete(item.id)}
              className="rounded-xl border border-rose-900/50 bg-rose-950/30 p-2 text-rose-400 transition-all hover:bg-rose-950/60"
              title="Видалити регулярний платіж"
            >
              <Trash2 size={15} />
            </button>
          )}
          <button
            onClick={onClose}
            className="flex-1 rounded-xl bg-zinc-900 py-2 text-xs text-zinc-400 transition-all hover:bg-zinc-800"
          >
            Скасувати
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="flex-1 rounded-xl bg-white py-2 text-xs font-semibold text-black transition-all hover:bg-zinc-200 disabled:opacity-50"
          >
            {isSubmitting ? "Збереження..." : item ? "Оновити" : "Зберегти"}
          </button>
        </div>
      </div>
    </div>
  );
}
