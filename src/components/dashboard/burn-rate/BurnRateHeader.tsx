"use client";

import { TrendingUp, AlertTriangle, CheckCircle } from "lucide-react";
import { BudgetCycle } from "./types";

interface BurnRateHeaderProps {
  isCycleMode: boolean;
  activeCycle?: BudgetCycle | null;
  budgetLimit: number;
  isFutureMonth: boolean;
  isOverPace: boolean;
  diffFromTarget: number;
}

export function BurnRateHeader({
  isCycleMode,
  activeCycle,
  budgetLimit,
  isFutureMonth,
  isOverPace,
  diffFromTarget,
}: BurnRateHeaderProps) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2.5">
      <div>
        <h2 className="flex items-center gap-2 text-xs font-semibold tracking-wider text-zinc-400 uppercase">
          <TrendingUp size={14} className="text-zinc-500" />
          Динаміка спалювання бюджету (Burn Rate)
        </h2>
        <p className="mt-0.5 text-[11px] text-zinc-500">
          {isCycleMode && activeCycle?.name ? (
            <>
              Зарплатний цикл «{activeCycle.name}» (ліміт{" "}
              <span className="font-mono text-zinc-300">
                {budgetLimit.toLocaleString("uk-UA")} ₴
              </span>
              )
            </>
          ) : (
            <>
              Ступінчастий план з урахуванням підписок (ліміт{" "}
              <span className="font-mono text-zinc-300">
                {budgetLimit.toLocaleString("uk-UA")} ₴
              </span>
              )
            </>
          )}
        </p>
      </div>

      {!isFutureMonth && (
        <div className="flex items-center gap-2">
          {isOverPace ? (
            <span className="flex items-center gap-1.5 rounded-full border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 font-mono text-[11px] font-medium text-rose-400 tabular-nums">
              <AlertTriangle size={12} className="shrink-0" />
              Випередження на {Math.abs(diffFromTarget).toLocaleString(
                "uk-UA"
              )}{" "}
              ₴
            </span>
          ) : (
            <span className="flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 font-mono text-[11px] font-medium text-emerald-400 tabular-nums">
              <CheckCircle size={12} className="shrink-0" />
              Запас {Math.abs(diffFromTarget).toLocaleString("uk-UA")} ₴
            </span>
          )}
        </div>
      )}
    </div>
  );
}
