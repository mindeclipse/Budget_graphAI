"use client";

import React from "react";
import { HelpCircle } from "lucide-react";
import { CATEGORY_ICONS } from "@/constants/categories";
import { CategoryStatItem } from "@/hooks/useBudgetMetrics";

interface CategoryBreakdownProps {
  categoryStats: CategoryStatItem[];
  onSelectCategory: (categoryName: string) => void;
}

export function CategoryBreakdown({
  categoryStats,
  onSelectCategory,
}: CategoryBreakdownProps) {
  return (
    <div className="relative rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]">
      <h2 className="mb-3.5 text-xs font-semibold tracking-wider text-zinc-400 uppercase">
        Структура витрат за категоріями
      </h2>

      {categoryStats.length === 0 ? (
        <p className="py-4 text-sm text-zinc-600">Категорії ще не сформовані</p>
      ) : (
        <div className="space-y-2">
          {categoryStats.map((cat) => {
            const IconComponent = CATEGORY_ICONS[cat.name] || HelpCircle;
            const catColor = cat.color || "#10B981";
            const percent = Number(cat.percentage) || 0;

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
                    <span className="truncate text-xs font-medium text-zinc-200 transition-colors group-hover:text-white">
                      {cat.name}
                    </span>
                  </div>

                  <div className="flex shrink-0 items-baseline gap-2 font-mono text-xs tabular-nums">
                    <span className="font-semibold text-white">
                      {cat.amount.toLocaleString("uk-UA")} ₴
                    </span>
                    <span className="text-[11px] font-medium text-zinc-500">
                      {percent}%
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
