"use client";

import { useState } from "react";
import { X, Check } from "lucide-react";
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

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmount = parseFloat(amount.replace(",", "."));
    if (!parsedAmount || isNaN(parsedAmount)) return;

    createTransaction({
      amount: parsedAmount,
      merchant_raw: merchant.trim() || "Ручна витрата",
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-xs sm:items-center sm:p-4">
      <div className="w-full max-w-md rounded-t-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-zinc-800/80 pb-4">
          <h2 className="text-base font-semibold text-zinc-100">
            Нова витрата
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-zinc-400 transition-colors hover:bg-zinc-900 hover:text-zinc-100"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-400">
              Сума (грн)
            </label>
            <input
              type="text"
              inputMode="decimal"
              autoFocus
              required
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-xl border border-zinc-800 bg-zinc-900/80 px-4 py-2.5 text-xl font-semibold text-zinc-100 placeholder-zinc-600 focus:border-zinc-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-400">
              Заклад / Опис
            </label>
            <input
              type="text"
              placeholder="Сільпо, Кава, Аптека тощо"
              value={merchant}
              onChange={(e) => setMerchant(e.target.value)}
              className="w-full rounded-xl border border-zinc-800 bg-zinc-900/80 px-4 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-zinc-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-400">
              Категорія
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-xl border border-zinc-800 bg-zinc-900/80 px-3 py-2 text-sm text-zinc-200 focus:border-zinc-500 focus:outline-none"
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

          <button
            type="submit"
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-100 py-3 text-sm font-semibold text-zinc-900 transition-transform hover:bg-white active:scale-[0.98]"
          >
            <Check size={16} /> Зберегти витрату
          </button>
        </form>
      </div>
    </div>
  );
}
