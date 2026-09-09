"use client";

import { useState, useEffect } from "react";
import { X, Check, ArrowDownLeft } from "lucide-react";
import { useTransactionMutations } from "@/hooks/useTransactionMutations";

const CATEGORIES = [
  "Продукти",
  "Кафе та ресторани",
  "Куріння",
  "Транспорт",
  "Авто",
  "Одяг та взуття",
  "Здоров'я",
  "Оренда та комуналка",
  "Підписки та сервіси",
  "Освіта та книги",
  "Розваги та хобі",
  "Покупки",
  "Інвестиції",
  "Інше",
];

interface CreateTransactionDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CreateTransactionDrawer({
  isOpen,
  onClose,
}: CreateTransactionDrawerProps) {
  const { createTransaction } = useTransactionMutations();
  const [amount, setAmount] = useState("");
  const [merchant, setMerchant] = useState("");
  const [category, setCategory] = useState("Продукти");

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

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmount = parseFloat(amount.replace(",", "."));
    if (
      !parsedAmount ||
      isNaN(parsedAmount) ||
      parsedAmount <= 0 ||
      parsedAmount > 10_000_000
    ) {
      return;
    }

    const cleanMerchant = merchant.trim().slice(0, 255) || "Ручна витрата";

    createTransaction({
      amount: parsedAmount,
      merchant_raw: cleanMerchant,
      category_name: category,
      type: "expense",
      currency: "UAH",
      source: "manual",
      exclude_from_budget: false,
      created_at: new Date().toISOString(),
    });

    setAmount("");
    setMerchant("");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      {/* Клік по підкладці закриває форму */}
      <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />

      {/* Адаптивна шторка для iPhone / Центрована картка для десктопу */}
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-md flex-col overscroll-contain rounded-t-[28px] border border-zinc-800 bg-zinc-950 p-5 pt-3 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl sm:max-h-[85vh] sm:rounded-3xl sm:p-6 sm:pb-6">
        {/* Grabber Bar для iOS */}
        <div className="mx-auto mb-3 h-1.5 w-11 shrink-0 rounded-full bg-zinc-700/50 sm:hidden" />

        {/* Шапка модалки */}
        <div className="mb-4 flex items-center justify-between border-b border-zinc-800/80 pb-3.5">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-500/10 text-rose-400">
              <ArrowDownLeft size={16} />
            </div>
            <h2 className="text-base font-bold text-white">Нова витрата</h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900/60 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white active:scale-95"
          >
            <X size={16} />
          </button>
        </div>

        {/* Форма внесення витрати */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Поле введення суми */}
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold tracking-wider text-zinc-400 uppercase">
              Сума
            </label>
            <div className="relative flex items-center">
              <input
                type="text"
                inputMode="decimal"
                autoFocus
                required
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full rounded-2xl border border-zinc-800 bg-zinc-900/80 px-4 py-3 pr-12 font-mono text-2xl font-bold tracking-tight text-white tabular-nums placeholder-zinc-700 transition-colors focus:border-zinc-600 focus:outline-none"
              />
              <span className="pointer-events-none absolute right-4 text-base font-bold text-zinc-500">
                ₴
              </span>
            </div>
          </div>

          {/* Заклад або опис */}
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold tracking-wider text-zinc-400 uppercase">
              Заклад / Опис
            </label>
            <input
              type="text"
              placeholder="Сільпо, Кава, Аптека тощо..."
              value={merchant}
              onChange={(e) => setMerchant(e.target.value)}
              className="w-full rounded-xl border border-zinc-800 bg-zinc-900/80 px-3.5 py-2.5 text-base text-white placeholder-zinc-600 transition-colors focus:border-zinc-600 focus:outline-none sm:text-xs"
            />
          </div>

          {/* Вибір категорії */}
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold tracking-wider text-zinc-400 uppercase">
              Категорія
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-xl border border-zinc-800 bg-zinc-900/80 px-3 py-2.5 text-base text-zinc-200 transition-colors focus:border-zinc-600 focus:outline-none sm:text-xs"
            >
              {CATEGORIES.map((cat) => (
                <option
                  key={cat}
                  value={cat}
                  className="bg-zinc-900 text-zinc-200"
                >
                  {cat}
                </option>
              ))}
            </select>
          </div>

          {/* Кнопка збереження */}
          <div className="pt-2">
            <button
              type="submit"
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-sky-600 py-3 text-xs font-bold text-white shadow-lg shadow-sky-950/40 transition-all hover:bg-sky-500 active:scale-[0.98]"
            >
              <Check size={16} /> Зберегти витрату
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
