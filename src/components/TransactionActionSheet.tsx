"use client";

import { useState, useEffect } from "react";
import { X, Trash2, Tag as TagIcon, Plus } from "lucide-react";
import { Transaction } from "@/types/finance";
import {
  CATEGORIES,
  CATEGORY_ICONS,
  CATEGORY_COLORS,
} from "@/constants/categories";

interface TransactionActionSheetProps {
  transaction: Transaction | null;
  onClose: () => void;
  onUpdateCategory: (txId: number, newCategory: string) => Promise<void>;
  onUpdateTags: (txId: number, newTags: string[]) => Promise<void>;
  onDelete: (txId: number) => Promise<void>;
}

export function TransactionActionSheet({
  transaction,
  onClose,
  onUpdateCategory,
  onUpdateTags,
  onDelete,
}: TransactionActionSheetProps) {
  const [tagInput, setTagInput] = useState("");
  const [currentTags, setCurrentTags] = useState<string[]>([]);

  useEffect(() => {
    if (transaction) {
      setCurrentTags(transaction.tags || []);
    }
    setTagInput("");
  }, [transaction]);

  if (!transaction) return null;

  const handleAddTag = async () => {
    const cleanTag = tagInput.trim().replace(/^#/, "").toLowerCase();
    if (!cleanTag || currentTags.includes(cleanTag)) return;

    const updated = [...currentTags, cleanTag];
    setCurrentTags(updated);
    setTagInput("");
    await onUpdateTags(transaction.id, updated);
  };

  const handleRemoveTag = async (tagToRemove: string) => {
    const updated = currentTags.filter((t) => t !== tagToRemove);
    setCurrentTags(updated);
    await onUpdateTags(transaction.id, updated);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="fixed inset-0" onClick={onClose} />

      <div className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl sm:rounded-3xl">
        {/* Шапка модалки */}
        <div className="mb-5 flex items-start justify-between border-b border-zinc-800/80 pb-4">
          <div>
            <h3 className="text-base font-bold text-white">
              {transaction.merchant_raw}
            </h3>
            <p className="mt-0.5 text-xs text-zinc-400">
              {new Date(transaction.created_at).toLocaleString("uk-UA")} •{" "}
              <strong className="text-white">
                {Number(transaction.amount).toFixed(2)} ₴
              </strong>
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl p-1.5 text-zinc-400 transition-colors hover:bg-zinc-900 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        {/* Секція керування тегами */}
        <div className="mb-6">
          <label className="mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wider text-zinc-400 uppercase">
            <TagIcon size={12} className="text-zinc-500" /> Теги події
          </label>

          <div className="mb-2.5 flex flex-wrap gap-1.5">
            {currentTags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-xs font-medium text-zinc-300"
              >
                #{tag}
                <button
                  onClick={() => handleRemoveTag(tag)}
                  className="text-zinc-500 hover:text-rose-400"
                >
                  <X size={12} />
                </button>
              </span>
            ))}
            {currentTags.length === 0 && (
              <span className="text-xs text-zinc-600">Тегів немає</span>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleAddTag();
            }}
            className="flex gap-2"
          >
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              placeholder="Додати тег (наприклад, поїздка_київ)..."
              className="flex-1 rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-white placeholder-zinc-600 focus:border-zinc-700 focus:outline-none"
            />
            <button
              type="submit"
              disabled={!tagInput.trim()}
              className="flex items-center gap-1 rounded-xl bg-zinc-800 px-3 py-2 text-xs font-semibold text-white transition-all hover:bg-zinc-700 disabled:opacity-40"
            >
              <Plus size={14} /> Додати
            </button>
          </form>
        </div>

        {/* Вибір категорії */}
        <div className="mb-6">
          <label className="mb-2 block text-xs font-semibold tracking-wider text-zinc-400 uppercase">
            Категорія
          </label>
          <div className="grid max-h-48 grid-cols-2 gap-1.5 overflow-y-auto pr-1">
            {CATEGORIES.map((catName) => {
              const Icon = CATEGORY_ICONS[catName];
              const color = CATEGORY_COLORS[catName] || "#71717a";
              const isSelected = transaction.category_name === catName;

              return (
                <button
                  key={catName}
                  onClick={() => onUpdateCategory(transaction.id, catName)}
                  className={`flex items-center gap-2 rounded-xl border p-2 text-left text-xs transition-all ${
                    isSelected
                      ? "border-zinc-500 bg-zinc-800 font-semibold text-white"
                      : "border-zinc-800/80 bg-zinc-900/40 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
                  }`}
                >
                  {Icon && (
                    <span
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded"
                      style={{ backgroundColor: `${color}20`, color }}
                    >
                      <Icon size={12} />
                    </span>
                  )}
                  <span className="truncate">{catName}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Видалення транзакції */}
        <button
          onClick={() => onDelete(transaction.id)}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-rose-900/50 bg-rose-950/20 py-2.5 text-xs font-bold text-rose-400 transition-all hover:bg-rose-900/40"
        >
          <Trash2 size={14} /> Видалити транзакцію
        </button>
      </div>
    </div>
  );
}
