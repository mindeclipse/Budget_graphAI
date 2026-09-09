"use client";

import { useState, useEffect } from "react";
import { X, Trash2, CalendarClock, Loader2 } from "lucide-react";
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
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "unset";
    };
  }, [isOpen, onClose]);

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
    setIsConfirmingDelete(false);
  }, [item, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmount = parseFloat(amount.replace(",", "."));
    const rawDay = parseInt(day, 10) || 1;
    const clampedDay = Math.min(31, Math.max(1, rawDay));

    if (
      !title.trim() ||
      isNaN(parsedAmount) ||
      parsedAmount <= 0 ||
      parsedAmount > 10_000_000
    ) {
      return;
    }

    setIsSubmitting(true);
    try {
      await onSave({
        id: item?.id,
        title: title.trim().slice(0, 150),
        amount: parsedAmount,
        currency,
        category_name: category,
        day_of_month: clampedDay,
      });
      onClose();
    } catch (err) {
      console.error("Помилка збереження регулярного платежу:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      {/* Клік по підкладці закриває шторку */}
      <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />

      {/* Адаптивна шторка для iPhone / Центрована картка для десктопу */}
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-md flex-col overscroll-contain rounded-t-[28px] border border-zinc-800 bg-zinc-950 p-5 pt-3 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl sm:max-h-[85vh] sm:rounded-3xl sm:p-6 sm:pb-6">
        {/* Grabber Bar для iOS */}
        <div className="mx-auto mb-3 h-1.5 w-11 shrink-0 rounded-full bg-zinc-700/50 sm:hidden" />

        {/* Шапка модалки */}
        <div className="mb-4 flex items-center justify-between border-b border-zinc-800/80 pb-3.5">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-500/10 text-sky-400">
              <CalendarClock size={16} />
            </div>
            <h3 className="text-base font-bold text-white">
              {item ? "Редагування витрати" : "Новий постійний платіж"}
            </h3>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900/60 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white active:scale-95"
          >
            <X size={16} />
          </button>
        </div>

        {/* Форма */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold tracking-wider text-zinc-400 uppercase">
              Назва платежу
            </label>
            <input
              type="text"
              placeholder="Оренда, зв'язок, iCloud..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-xl border border-zinc-800 bg-zinc-900/80 px-3.5 py-2.5 text-base text-white placeholder-zinc-600 transition-colors focus:border-zinc-600 focus:outline-none sm:text-xs"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold tracking-wider text-zinc-400 uppercase">
                Сума і валюта
              </label>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="100"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full min-w-0 rounded-xl border border-zinc-800 bg-zinc-900/80 px-3 py-2.5 font-mono text-base text-white tabular-nums placeholder-zinc-600 transition-colors focus:border-zinc-600 focus:outline-none sm:text-xs"
                />
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value as "UAH" | "USD")}
                  className="rounded-xl border border-zinc-800 bg-zinc-900 px-2.5 py-2.5 text-base font-semibold text-zinc-200 transition-colors focus:border-zinc-600 focus:outline-none sm:text-xs"
                >
                  <option value="UAH">₴</option>
                  <option value="USD">$</option>
                </select>
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-[11px] font-semibold tracking-wider text-zinc-400 uppercase">
                День місяця
              </label>
              <input
                type="number"
                min="1"
                max="31"
                inputMode="numeric"
                value={day}
                onChange={(e) => setDay(e.target.value)}
                className="w-full rounded-xl border border-zinc-800 bg-zinc-900/80 px-3 py-2.5 font-mono text-base text-white tabular-nums transition-colors focus:border-zinc-600 focus:outline-none sm:text-xs"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-[11px] font-semibold tracking-wider text-zinc-400 uppercase">
              Категорія
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-xl border border-zinc-800 bg-zinc-900/80 px-3 py-2.5 text-base text-zinc-200 transition-colors focus:border-zinc-600 focus:outline-none sm:text-xs"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {isConfirmingDelete ? (
            <div className="flex items-center gap-2 pt-3">
              <button
                type="button"
                onClick={() => setIsConfirmingDelete(false)}
                className="h-10 flex-1 rounded-xl border border-zinc-800 bg-zinc-900/60 text-xs font-semibold text-zinc-400 transition-all hover:bg-zinc-800 hover:text-white active:scale-95"
              >
                Скасувати
              </button>
              <button
                type="button"
                onClick={() => {
                  if (item && item.id !== undefined) {
                    onDelete(item.id);
                  }
                }}
                className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-rose-600 text-xs font-bold text-white shadow-lg shadow-rose-950/40 transition-all hover:bg-rose-500 active:scale-95"
              >
                <Trash2 size={14} />
                Точно видалити?
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 pt-3">
              {item && item.id !== undefined && (
                <button
                  type="button"
                  onClick={() => setIsConfirmingDelete(true)}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-rose-900/40 bg-rose-950/20 text-rose-400 transition-all hover:bg-rose-900/30 active:scale-95"
                  title="Видалити платіж"
                >
                  <Trash2 size={16} />
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="h-10 flex-1 rounded-xl border border-zinc-800 bg-zinc-900/60 text-xs font-semibold text-zinc-400 transition-all hover:bg-zinc-800 hover:text-white active:scale-95"
              >
                Скасувати
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-white text-xs font-semibold text-black shadow-md transition-all hover:bg-zinc-200 active:scale-95 disabled:opacity-50"
              >
                {isSubmitting ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : item ? (
                  "Оновити"
                ) : (
                  "Зберегти"
                )}
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
