"use client";

import {
  ArrowUpRight,
  ArrowDownRight,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import { CategoryDiff } from "./types";

interface CategoryDiffTableProps {
  categoryDiffs: CategoryDiff[];
  isExpanded: boolean;
  onToggleExpand: () => void;
  currentMonthLabel: string;
  previousMonthLabel: string;
  defaultVisibleCount?: number;
}

export function CategoryDiffTable({
  categoryDiffs,
  isExpanded,
  onToggleExpand,
  currentMonthLabel,
  previousMonthLabel,
  defaultVisibleCount = 5,
}: CategoryDiffTableProps) {
  const displayedRows = isExpanded
    ? categoryDiffs
    : categoryDiffs.slice(0, defaultVisibleCount);
  const hiddenCount = categoryDiffs.length - defaultVisibleCount;

  return (
    <>
      <div className="divide-y divide-zinc-900 overflow-x-auto">
        <div className="grid grid-cols-12 pb-2 text-[10px] tracking-wider text-zinc-500 uppercase">
          <div className="col-span-5">Категорія</div>
          <div className="col-span-2 text-right">{previousMonthLabel}</div>
          <div className="col-span-3 text-right">{currentMonthLabel}</div>
          <div className="col-span-2 text-right">Зміна</div>
        </div>

        {displayedRows.map((row) => {
          const isIncreased = row.diffAmount > 0;
          const isDecreased = row.diffAmount < 0;

          return (
            <div
              key={row.category}
              className="grid grid-cols-12 items-center py-2.5 text-xs transition-colors hover:bg-white/[0.02]"
            >
              <div className="col-span-5 truncate font-medium text-zinc-200">
                {row.category}
              </div>

              {/* Минулий період */}
              <div className="col-span-2 text-right font-mono text-[11px] text-zinc-500 tabular-nums">
                {row.prevAmount > 0
                  ? `${row.prevAmount.toLocaleString("uk-UA")} ₴`
                  : "—"}
              </div>

              {/* Поточний період */}
              <div className="col-span-3 text-right font-mono text-[11px] font-semibold text-zinc-200 tabular-nums">
                {row.currentAmount > 0
                  ? `${row.currentAmount.toLocaleString("uk-UA")} ₴`
                  : "0 ₴"}
              </div>

              <div className="col-span-2 flex items-center justify-end gap-0.5 font-mono text-[11px] tabular-nums">
                {isIncreased && (
                  <span className="flex items-center text-rose-400">
                    <ArrowUpRight size={11} />
                    {row.percentChange !== null
                      ? `+${row.percentChange.toFixed(0)}%`
                      : "Нова"}
                  </span>
                )}
                {isDecreased && (
                  <span className="flex items-center text-emerald-400">
                    <ArrowDownRight size={11} />
                    {row.percentChange !== null
                      ? `${row.percentChange.toFixed(0)}%`
                      : "—"}
                  </span>
                )}
                {!isIncreased && !isDecreased && (
                  <span className="text-zinc-600">—</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {categoryDiffs.length > defaultVisibleCount && (
        <button
          type="button"
          onClick={onToggleExpand}
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-zinc-800/80 bg-zinc-900/40 py-2 text-xs font-medium text-zinc-400 transition-all hover:border-zinc-700 hover:bg-zinc-800/60 hover:text-zinc-200"
        >
          {isExpanded ? (
            <>
              <ChevronUp size={13} /> Згорнути
            </>
          ) : (
            <>
              <ChevronDown size={13} /> Показати всі (+{hiddenCount})
            </>
          )}
        </button>
      )}
    </>
  );
}
