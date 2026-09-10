"use client";

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  HelpCircle,
  Sliders,
  X,
  Check,
  Trash2,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { CATEGORY_ICONS } from "@/constants/categories";
import { CategoryStatItem } from "@/hooks/useBudgetMetrics";

interface CategoryBreakdownProps {
  categoryStats: CategoryStatItem[];
  categoryBudgets?: Record<string, number>;
  onSelectCategory: (categoryName: string) => void;
  onSaveCategoryBudget?: (categoryName: string, limit: number) => Promise<void>;
  onDeleteCategoryBudget?: (categoryName: string) => Promise<void>;
}

export function CategoryBreakdown({
  categoryStats,
  categoryBudgets = {},
  onSelectCategory,
  onSaveCategoryBudget,
  onDeleteCategoryBudget,
}: CategoryBreakdownProps) {
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [limitInput, setLimitInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const openBudgetModal = (e: React.MouseEvent, catName: string) => {
    e.stopPropagation();
    setEditingCategory(catName);
    const existing = categoryBudgets[catName];
    setLimitInput(existing ? String(existing) : "");
  };

  const handleSaveLimit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCategory || !onSaveCategoryBudget || isSubmitting) return;

    const val = parseFloat(limitInput);
    if (isNaN(val) || val <= 0) return;

    setIsSubmitting(true);
    try {
      await onSaveCategoryBudget(editingCategory, val);
      setEditingCategory(null);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteLimit = async () => {
    if (!editingCategory || !onDeleteCategoryBudget || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onDeleteCategoryBudget(editingCategory);
      setEditingCategory(null);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="relative rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]">
      <div className="mb-3.5 flex items-center justify-between">
        <h2 className="text-xs font-semibold tracking-wider text-zinc-400 uppercase">
          Структура витрат та ліміти
        </h2>
        <span className="text-[10px] text-zinc-500">
          Натисніть на слайдер для ліміту
        </span>
      </div>

      {categoryStats.length === 0 ? (
        <p className="py-4 text-sm text-zinc-600">Категорії ще не сформовані</p>
      ) : (
        <div className="space-y-2">
          {categoryStats.map((cat) => {
            const IconComponent = CATEGORY_ICONS[cat.name] || HelpCircle;
            const catColor = cat.color || "#10B981";
            const percent = Number(cat.percentage) || 0;
            const budgetLimit = categoryBudgets[cat.name];
            const hasLimit = typeof budgetLimit === "number" && budgetLimit > 0;
            const limitProgress = hasLimit
              ? Math.round((cat.amount / budgetLimit) * 100)
              : null;
            const isNearOrOverLimit =
              limitProgress !== null && limitProgress >= 85;
            const isOverLimit = limitProgress !== null && limitProgress > 100;

            return (
              <div
                key={cat.name}
                onClick={() => onSelectCategory(cat.name)}
                className="group relative cursor-pointer overflow-hidden rounded-xl border border-zinc-800/60 bg-zinc-900/30 p-2.5 transition-all duration-150 hover:border-zinc-700/80 hover:bg-zinc-900/60 active:scale-[0.99]"
              >
                <div
                  className="absolute inset-y-0 left-0 transition-all duration-700 ease-out"
                  style={{
                    width: `${Math.min(100, percent)}%`,
                    backgroundColor: catColor,
                    opacity: 0.12,
                  }}
                />

                <div
                  className="absolute inset-y-0 left-0 w-1 rounded-l-xl opacity-90 transition-opacity group-hover:opacity-100"
                  style={{ backgroundColor: catColor }}
                />

                <div className="relative z-10 flex items-center justify-between pl-1.5">
                  <div className="flex items-center space-x-2.5 truncate pr-2">
                    <div
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-transform duration-150 group-hover:scale-105"
                      style={{
                        backgroundColor: `${catColor}20`,
                        color: catColor,
                      }}
                    >
                      <IconComponent size={14} />
                    </div>
                    <div className="truncate">
                      <span className="truncate text-xs font-medium text-zinc-200 transition-colors group-hover:text-white">
                        {cat.name}
                      </span>
                      {hasLimit && (
                        <div className="flex items-center gap-1.5 text-[10px]">
                          <span
                            className={
                              isOverLimit
                                ? "font-bold text-rose-400"
                                : isNearOrOverLimit
                                  ? "font-semibold text-amber-400"
                                  : "text-zinc-500"
                            }
                          >
                            {cat.amount.toLocaleString()} /{" "}
                            {budgetLimit.toLocaleString()} ₴ ({limitProgress}%)
                          </span>
                          {isOverLimit && (
                            <AlertTriangle
                              size={11}
                              className="shrink-0 text-rose-400"
                            />
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <div className="flex items-baseline gap-2 font-mono text-xs tabular-nums">
                      <span className="font-semibold text-white">
                        {cat.amount.toLocaleString("uk-UA")} ₴
                      </span>
                      <span className="text-[11px] font-medium text-zinc-500">
                        {percent}%
                      </span>
                    </div>

                    {onSaveCategoryBudget && (
                      <button
                        type="button"
                        onClick={(e) => openBudgetModal(e, cat.name)}
                        title="Налаштувати ліміт категорії"
                        className={`flex h-6 w-6 items-center justify-center rounded-lg border transition-colors ${
                          hasLimit
                            ? "border-sky-500/40 bg-sky-500/10 text-sky-400"
                            : "hover:border-zinc-750 border-transparent text-zinc-600 hover:bg-zinc-800 hover:text-zinc-300"
                        }`}
                      >
                        <Sliders size={12} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Міні смужка ліміту категорії */}
                {hasLimit && (
                  <div className="relative mt-2 h-1 w-full overflow-hidden rounded-full bg-zinc-800/80">
                    <div
                      className={`h-full transition-all duration-500 ${
                        isOverLimit
                          ? "bg-rose-500"
                          : isNearOrOverLimit
                            ? "bg-amber-500"
                            : "bg-emerald-500"
                      }`}
                      style={{ width: `${Math.min(limitProgress || 0, 100)}%` }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Модалка налаштування ліміту */}
      {editingCategory &&
        mounted &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 p-0 backdrop-blur-sm sm:items-center sm:p-4">
            <div
              className="fixed inset-0"
              onClick={() => setEditingCategory(null)}
              aria-hidden="true"
            />

            <div className="relative z-10 flex max-h-[90dvh] w-full max-w-xs flex-col overscroll-contain rounded-t-[28px] border border-zinc-800 bg-zinc-950 shadow-2xl duration-200 sm:max-h-[85vh] sm:rounded-3xl">
              {/* Mobile handle indicator */}
              <div className="mx-auto mt-3 h-1.5 w-11 shrink-0 rounded-full bg-zinc-700/50 sm:hidden" />

              <div className="flex items-center justify-between border-b border-zinc-800/80 px-5 py-3.5 sm:px-5 sm:py-4">
                <h4 className="text-xs font-bold text-white">
                  Ліміт для «{editingCategory}»
                </h4>
                <button
                  type="button"
                  onClick={() => setEditingCategory(null)}
                  className="text-zinc-500 hover:text-white"
                >
                  <X size={15} />
                </button>
              </div>

              <form
                onSubmit={handleSaveLimit}
                className="flex min-h-0 flex-1 flex-col overflow-hidden"
              >
                <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
                  <div>
                    <label className="mb-1 block text-[11px] text-zinc-400">
                      Місячний ліміт витрат (₴)
                    </label>
                    <input
                      type="number"
                      step="any"
                      autoFocus
                      required
                      placeholder="наприклад 5000"
                      value={limitInput}
                      onChange={(e) => setLimitInput(e.target.value)}
                      className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white focus:border-sky-500 focus:outline-none"
                    />
                  </div>

                  <div className="flex gap-2">
                    {[2000, 5000, 10000].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setLimitInput(String(preset))}
                        className="flex-1 rounded-lg border border-zinc-800 bg-zinc-900 py-1 text-[10px] font-medium text-zinc-300 hover:border-zinc-700"
                      >
                        {preset.toLocaleString()} ₴
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2 border-t border-zinc-800/80 px-5 py-3.5 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:px-5 sm:py-4 sm:pb-4">
                  {categoryBudgets[editingCategory] &&
                    onDeleteCategoryBudget && (
                      <button
                        type="button"
                        onClick={handleDeleteLimit}
                        disabled={isSubmitting}
                        className="flex items-center justify-center rounded-xl border border-rose-900/40 bg-rose-950/20 px-3 py-2 text-xs font-bold text-rose-400 hover:bg-rose-900/30"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  <button
                    type="button"
                    onClick={() => setEditingCategory(null)}
                    className="flex-1 rounded-xl border border-zinc-800 py-2 text-xs font-semibold text-zinc-400 hover:bg-zinc-900"
                  >
                    Скасувати
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-sky-600 py-2 text-xs font-bold text-white hover:bg-sky-500 disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <Check size={13} />
                    )}
                    Зберегти
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
