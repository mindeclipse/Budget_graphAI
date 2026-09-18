"use client";

import React from "react";
import { CATEGORIES } from "@/constants/categories";

interface ReceiptDetailsFormProps {
  currency: string;
  amount: string;
  onChangeAmount: (val: string) => void;
  date: string;
  onChangeDate: (val: string) => void;
  recipient: string;
  onChangeRecipient: (val: string) => void;
  category: string;
  onChangeCategory: (val: string) => void;
  purpose?: string;
}

export const ReceiptDetailsForm: React.FC<ReceiptDetailsFormProps> = ({
  currency,
  amount,
  onChangeAmount,
  date,
  onChangeDate,
  recipient,
  onChangeRecipient,
  category,
  onChangeCategory,
  purpose,
}) => {
  return (
    <>
      {/* Сума та Отримувач */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-[11px] font-medium text-zinc-400">
            Сума операції ({currency})
          </label>
          <input
            type="text"
            value={amount}
            onChange={(e) => onChangeAmount(e.target.value)}
            className="w-full rounded-xl border border-zinc-800 bg-zinc-900/70 px-3 py-2 font-mono text-sm font-bold text-white outline-none focus:border-emerald-500/50"
            placeholder="0.00"
          />
        </div>

        <div>
          <label className="mb-1 block text-[11px] font-medium text-zinc-400">
            Дата та час
          </label>
          <input
            type="datetime-local"
            value={date}
            onChange={(e) => onChangeDate(e.target.value)}
            className="w-full rounded-xl border border-zinc-800 bg-zinc-900/70 px-3 py-2 text-xs text-white outline-none focus:border-emerald-500/50"
          />
        </div>
      </div>

      {/* Отримувач */}
      <div>
        <label className="mb-1 block text-[11px] font-medium text-zinc-400">
          Отримувач / Торговець
        </label>
        <input
          type="text"
          value={recipient}
          onChange={(e) => onChangeRecipient(e.target.value)}
          className="w-full rounded-xl border border-zinc-800 bg-zinc-900/70 px-3 py-2 text-xs text-white outline-none focus:border-emerald-500/50"
          placeholder="Назва компанії чи ФОП"
        />
      </div>

      {/* Категорія */}
      <div>
        <label className="mb-1 block text-[11px] font-medium text-zinc-400">
          Категорія
        </label>
        <select
          value={category}
          onChange={(e) => onChangeCategory(e.target.value)}
          className="w-full rounded-xl border border-zinc-800 bg-zinc-900/70 px-3 py-2 text-xs text-white outline-none focus:border-emerald-500/50"
        >
          {CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>
      </div>

      {/* Призначення платежу */}
      {purpose && (
        <div>
          <label className="mb-1 block text-[11px] font-medium text-zinc-400">
            Призначення платежу (з квитанції)
          </label>
          <div className="border-zinc-850 rounded-xl border bg-zinc-900/30 p-2.5 text-[11px] leading-relaxed text-zinc-400">
            {purpose}
          </div>
        </div>
      )}
    </>
  );
};
