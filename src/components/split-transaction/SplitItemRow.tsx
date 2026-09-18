"use client";

import React from "react";
import { Trash2 } from "lucide-react";
import { CATEGORIES } from "@/constants/categories";
import { SplitItemRowProps } from "./types";

export const SplitItemRow = React.memo(function SplitItemRow({
  item,
  index,
  canDelete,
  onRemove,
  onUpdate,
}: SplitItemRowProps) {
  return (
    <div className="space-y-2 rounded-2xl border border-zinc-800/80 bg-zinc-900/50 p-3.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-zinc-400 uppercase">
          Частина #{index + 1}
        </span>
        {canDelete && (
          <button
            type="button"
            onClick={() => onRemove(index)}
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
            onChange={(e) => onUpdate(index, "amount", e.target.value)}
            placeholder="0.00"
            className="w-full rounded-xl border border-zinc-700/60 bg-zinc-900 px-3 py-2 text-base font-semibold text-white focus:border-sky-500 focus:outline-none sm:text-sm"
          />
        </div>

        <div>
          <label className="mb-1 block text-[10px] text-zinc-500">
            Категорія
          </label>
          <select
            value={item.category_name}
            onChange={(e) => onUpdate(index, "category_name", e.target.value)}
            className="w-full rounded-xl border border-zinc-700/60 bg-zinc-900 px-2.5 py-2 text-base font-medium text-white focus:border-sky-500 focus:outline-none sm:text-xs"
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
          onChange={(e) => onUpdate(index, "merchant_raw", e.target.value)}
          placeholder="Опис частини (опціонально)..."
          className="w-full rounded-xl border border-zinc-800 bg-zinc-950/60 px-3 py-1.5 text-base text-zinc-300 placeholder-zinc-600 focus:border-zinc-700 focus:outline-none sm:text-xs"
        />
      </div>
    </div>
  );
});
