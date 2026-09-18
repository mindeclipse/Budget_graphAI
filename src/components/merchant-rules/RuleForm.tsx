"use client";

import React from "react";
import { Check, Loader2 } from "lucide-react";
import { CATEGORIES } from "@/constants/categories";

interface RuleFormProps {
  pattern: string;
  normalizedName: string;
  categoryName: string;
  editingPattern: string | null;
  isPending: boolean;
  onPatternChange: (val: string) => void;
  onNormalizedNameChange: (val: string) => void;
  onCategoryNameChange: (val: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
}

export function RuleForm({
  pattern,
  normalizedName,
  categoryName,
  editingPattern,
  isPending,
  onPatternChange,
  onNormalizedNameChange,
  onCategoryNameChange,
  onSubmit,
  onCancel,
}: RuleFormProps) {
  return (
    <form
      onSubmit={onSubmit}
      className="mb-3.5 rounded-2xl border border-sky-500/20 bg-sky-950/10 p-3.5"
    >
      <h4 className="mb-2.5 text-xs font-semibold text-sky-400">
        {editingPattern
          ? `Редагування правила для: ${editingPattern}`
          : "Нове правило автокатегоризації"}
      </h4>

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-[11px] font-medium text-zinc-400">
            Шаблон мерчанта (підрядок у чеку)
          </label>
          <input
            type="text"
            required
            value={pattern}
            disabled={!!editingPattern}
            onChange={(e) => onPatternChange(e.target.value)}
            placeholder="напр. SILPO або UBER"
            className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-white placeholder-zinc-600 focus:border-sky-500 focus:outline-none disabled:opacity-60"
          />
        </div>

        <div>
          <label className="mb-1 block text-[11px] font-medium text-zinc-400">
            Охайна назва в списку
          </label>
          <input
            type="text"
            value={normalizedName}
            onChange={(e) => onNormalizedNameChange(e.target.value)}
            placeholder="напр. Сільпо"
            className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-white placeholder-zinc-600 focus:border-sky-500 focus:outline-none"
          />
        </div>
      </div>

      <div className="mt-2.5">
        <label className="mb-1 block text-[11px] font-medium text-zinc-400">
          Категорія для автопризначення
        </label>
        <select
          value={categoryName}
          onChange={(e) => onCategoryNameChange(e.target.value)}
          className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-white focus:border-sky-500 focus:outline-none"
        >
          {CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-zinc-400 hover:bg-zinc-800 active:scale-95"
        >
          Скасувати
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="flex items-center gap-1 rounded-xl bg-sky-500 px-3.5 py-1.5 text-xs font-bold text-zinc-950 shadow-md shadow-sky-950/30 hover:bg-sky-400 active:scale-95 disabled:opacity-50"
        >
          {isPending ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <Check size={13} />
          )}
          <span>Зберегти</span>
        </button>
      </div>
    </form>
  );
}
