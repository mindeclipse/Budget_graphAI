"use client";

import { Loader2 } from "lucide-react";
import {
  CATEGORIES,
  CATEGORY_ICONS,
  CATEGORY_COLORS,
} from "@/constants/categories";

interface ActionSheetCategoryPickerProps {
  selectedCategory: string;
  onSelectCategory: (categoryName: string) => void;
  isSubmitting?: boolean;
}

export function ActionSheetCategoryPicker({
  selectedCategory,
  onSelectCategory,
  isSubmitting = false,
}: ActionSheetCategoryPickerProps) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <label className="text-[11px] font-semibold tracking-wider text-zinc-400 uppercase">
          Категорія (натисніть для вибору)
        </label>
        {isSubmitting && (
          <span className="flex items-center gap-1 text-[11px] text-zinc-500">
            <Loader2 size={11} className="animate-spin" /> Збереження...
          </span>
        )}
      </div>

      <div className="grid max-h-48 grid-cols-2 gap-1.5 overflow-y-auto pr-1">
        {CATEGORIES.map((catName) => {
          const Icon = CATEGORY_ICONS[catName];
          const color = CATEGORY_COLORS[catName] || "#71717a";
          const isSelected = selectedCategory === catName;

          return (
            <button
              key={catName}
              type="button"
              disabled={isSubmitting}
              onClick={() => onSelectCategory(catName)}
              className={`flex items-center gap-2 rounded-xl border p-2 text-left text-xs transition-all active:scale-[0.98] ${
                isSelected
                  ? "border-sky-500/50 bg-sky-500/10 font-semibold text-white shadow-xs"
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
  );
}
