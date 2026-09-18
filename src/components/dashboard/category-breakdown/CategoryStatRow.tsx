"use client";

import React from "react";
import { HelpCircle, Sliders, AlertTriangle } from "lucide-react";
import { CATEGORY_ICONS } from "@/constants/categories";
import { CategoryStatRowProps } from "./types";

export const CategoryStatRow = React.memo(function CategoryStatRow({
  cat,
  budgetLimit,
  onSelectCategory,
  onOpenBudgetModal,
}: CategoryStatRowProps) {
  const IconComponent = CATEGORY_ICONS[cat.name] || HelpCircle;
  const catColor = cat.color || "#10B981";
  const percent = Number(cat.percentage) || 0;
  const hasLimit = typeof budgetLimit === "number" && budgetLimit > 0;
  const limitProgress = hasLimit
    ? Math.round((cat.amount / budgetLimit) * 100)
    : null;
  const isNearOrOverLimit = limitProgress !== null && limitProgress >= 85;
  const isOverLimit = limitProgress !== null && limitProgress > 100;

  return (
    <div
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
                  {cat.amount.toLocaleString()} / {budgetLimit.toLocaleString()}{" "}
                  ₴ ({limitProgress}%)
                </span>
                {isOverLimit && (
                  <AlertTriangle size={11} className="shrink-0 text-rose-400" />
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

          {onOpenBudgetModal && (
            <button
              type="button"
              onClick={(e) => onOpenBudgetModal(e, cat.name)}
              title="Налаштувати ліміт категорії"
              className={`flex h-6 w-6 items-center justify-center rounded-lg border transition-colors ${
                hasLimit
                  ? "border-sky-500/40 bg-sky-500/10 text-sky-400"
                  : "border-transparent text-zinc-600 hover:border-zinc-700 hover:bg-zinc-800 hover:text-zinc-300"
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
});
