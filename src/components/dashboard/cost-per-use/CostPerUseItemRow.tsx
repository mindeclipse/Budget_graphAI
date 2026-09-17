"use client";

import { Zap, Coffee, Trash2, Loader2 } from "lucide-react";
import { CostPerUseItem } from "@/types/finance";
import { calculateItemCpuMetrics } from "./types";

interface CostPerUseItemRowProps {
  item: CostPerUseItem;
  isLogging: boolean;
  onLogUse: (id: number) => void;
  onDelete: (id: number) => void;
}

export function CostPerUseItemRow({
  item,
  isLogging,
  onLogUse,
  onDelete,
}: CostPerUseItemRowProps) {
  const { uses, price, currentCost, moneySaved, roiPercent } =
    calculateItemCpuMetrics(item);

  return (
    <div className="group relative rounded-xl border border-slate-800/70 bg-slate-800/30 p-3.5 transition-all hover:border-slate-700">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-slate-100">
              {item.item_name}
            </span>
            <span className="rounded-md bg-slate-800 px-2 py-0.5 text-[10px] font-medium text-slate-400">
              {item.category_name}
            </span>
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-400">
            <span>
              Куплено: {price.toLocaleString("uk-UA")} {item.currency}
            </span>
            <span>•</span>
            <span className="font-semibold text-slate-200">
              {uses}{" "}
              {uses === 1
                ? "використання"
                : uses < 5
                  ? "використання"
                  : "використань"}
            </span>
          </div>
        </div>

        {/* Поточна вартість за раз */}
        <div className="text-right">
          <div className="text-xs text-slate-400">Ціна за 1 раз:</div>
          <div className="text-base font-bold text-cyan-400">
            {currentCost.toLocaleString("uk-UA")} {item.currency}
          </div>
        </div>
      </div>

      {/* Окупність та Бенчмарк */}
      {item.benchmark_cost_per_use && (
        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-800/60 pt-2 text-[11px]">
          <div className="flex items-center gap-1.5 text-slate-300">
            <Coffee className="h-3 w-3 text-amber-400" />
            <span>
              Аналог:{" "}
              {Number(item.benchmark_cost_per_use).toLocaleString("uk-UA")}{" "}
              {item.currency}
            </span>
            {roiPercent >= 100 ? (
              <span className="rounded-full border border-emerald-500/30 bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                Окупилася на {roiPercent}% (+{Math.round(moneySaved)} ₴)
              </span>
            ) : (
              <span className="text-cyan-400">Окупність: {roiPercent}%</span>
            )}
          </div>
        </div>
      )}

      {/* Кнопки дій */}
      <div className="mt-3 flex items-center justify-between gap-2">
        <button
          onClick={() => onLogUse(item.id)}
          disabled={isLogging}
          className="flex items-center gap-1.5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold text-cyan-300 transition-all hover:bg-cyan-500/20 active:scale-95 disabled:opacity-50"
        >
          {isLogging ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Zap className="h-3.5 w-3.5 text-cyan-400" />
          )}
          +1 Використання
        </button>

        <button
          onClick={() => onDelete(item.id)}
          className="p-1 text-slate-500 transition-colors hover:text-rose-400"
          title="Видалити з трекера"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
