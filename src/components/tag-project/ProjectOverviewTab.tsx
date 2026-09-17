"use client";

import { TrendingUp, HelpCircle } from "lucide-react";
import { CATEGORY_ICONS, CATEGORY_COLORS } from "@/constants/categories";
import { ProjectMetricsResult } from "./types";

interface ProjectOverviewTabProps {
  metrics: ProjectMetricsResult;
}

export function ProjectOverviewTab({ metrics }: ProjectOverviewTabProps) {
  return (
    <>
      {/* Зведені картки метрик */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl border border-zinc-800/70 bg-zinc-900/40 p-3">
          <span className="block text-[10px] font-medium tracking-wider text-zinc-500 uppercase">
            Витрачено
          </span>
          <span className="font-mono text-sm font-bold text-rose-400 tabular-nums">
            {metrics.totalSpent.toLocaleString("uk-UA", {
              maximumFractionDigits: 0,
            })}{" "}
            ₴
          </span>
        </div>

        <div className="rounded-xl border border-zinc-800/70 bg-zinc-900/40 p-3">
          <span className="block text-[10px] font-medium tracking-wider text-zinc-500 uppercase">
            Чеки
          </span>
          <span className="font-mono text-sm font-bold text-zinc-200 tabular-nums">
            {metrics.expenseTxs.length}{" "}
            <span className="text-xs font-normal text-zinc-500">оп.</span>
          </span>
        </div>

        <div className="rounded-xl border border-zinc-800/70 bg-zinc-900/40 p-3">
          <span className="block text-[10px] font-medium tracking-wider text-zinc-500 uppercase">
            Сер. чек
          </span>
          <span className="font-mono text-sm font-bold text-zinc-200 tabular-nums">
            {Math.round(metrics.avgCheck).toLocaleString("uk-UA")} ₴
          </span>
        </div>
      </div>

      {/* Якщо у проєкті були доходи/надходження */}
      {metrics.totalIncome > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs">
          <div className="flex items-center gap-2 text-emerald-400">
            <TrendingUp size={14} />
            <span>Надходження за проєктом:</span>
          </div>
          <span className="font-mono font-bold text-emerald-400 tabular-nums">
            +{metrics.totalIncome.toLocaleString("uk-UA")} ₴
          </span>
        </div>
      )}

      {/* Розбивка за категоріями у проєкті */}
      {metrics.categories.length > 0 && (
        <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/30 p-4">
          <h3 className="mb-3 text-[11px] font-semibold tracking-wider text-zinc-400 uppercase">
            Розподіл за категоріями
          </h3>
          <div className="space-y-3">
            {metrics.categories.map((cat) => {
              const IconComponent = CATEGORY_ICONS[cat.name] || HelpCircle;
              const color = CATEGORY_COLORS[cat.name] || "#71717A";

              return (
                <div key={cat.name} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded"
                        style={{
                          backgroundColor: `${color}20`,
                          color,
                        }}
                      >
                        <IconComponent size={12} />
                      </span>
                      <span className="font-medium text-zinc-200">
                        {cat.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 font-mono tabular-nums">
                      <span className="text-zinc-200">
                        {cat.amount.toLocaleString("uk-UA")} ₴
                      </span>
                      <span className="text-[11px] text-zinc-500">
                        ({cat.percentage.toFixed(0)}%)
                      </span>
                    </div>
                  </div>
                  {/* Прогрес-бар */}
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${cat.percentage}%`,
                        backgroundColor: color,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Динаміка за місяцями (якщо витрати тривають понад 1 місяць) */}
      {metrics.monthlyDistribution.length > 1 && (
        <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/30 p-4">
          <h3 className="mb-3 text-[11px] font-semibold tracking-wider text-zinc-400 uppercase">
            Динаміка за місяцями
          </h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {metrics.monthlyDistribution.map((m) => (
              <div
                key={m.key}
                className="rounded-xl border border-zinc-800/60 bg-zinc-900/60 p-2.5"
              >
                <span className="block text-[11px] font-medium text-zinc-400">
                  {m.label}
                </span>
                <div className="mt-1 flex items-baseline justify-between">
                  <span className="font-mono text-xs font-bold text-zinc-200 tabular-nums">
                    {m.amount.toLocaleString("uk-UA")} ₴
                  </span>
                  <span className="text-[10px] text-zinc-500">
                    {m.count} оп.
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
