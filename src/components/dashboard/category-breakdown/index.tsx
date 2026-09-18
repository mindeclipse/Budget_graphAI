"use client";

import React, { useState, useEffect, useCallback } from "react";
import { CategoryBreakdownProps } from "./types";
import { CategoryStatRow } from "./CategoryStatRow";
import { CategoryBudgetModal } from "./CategoryBudgetModal";

export * from "./types";
export * from "./CategoryStatRow";
export * from "./CategoryBudgetModal";

export const CategoryBreakdown = React.memo(function CategoryBreakdown({
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

  const openBudgetModal = useCallback(
    (e: React.MouseEvent, catName: string) => {
      e.stopPropagation();
      setEditingCategory(catName);
      const existing = categoryBudgets[catName];
      setLimitInput(existing ? String(existing) : "");
    },
    [categoryBudgets]
  );

  const handleCloseModal = useCallback(() => {
    setEditingCategory(null);
  }, []);

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
          {categoryStats.map((cat) => (
            <CategoryStatRow
              key={cat.name}
              cat={cat}
              budgetLimit={categoryBudgets[cat.name]}
              onSelectCategory={onSelectCategory}
              onOpenBudgetModal={
                onSaveCategoryBudget ? openBudgetModal : undefined
              }
            />
          ))}
        </div>
      )}

      {/* Модалка налаштування ліміту */}
      {editingCategory && mounted && (
        <CategoryBudgetModal
          categoryName={editingCategory}
          categoryBudgets={categoryBudgets}
          limitInput={limitInput}
          isSubmitting={isSubmitting}
          onLimitInputChange={setLimitInput}
          onClose={handleCloseModal}
          onSave={handleSaveLimit}
          onDelete={onDeleteCategoryBudget ? handleDeleteLimit : undefined}
        />
      )}
    </div>
  );
});
