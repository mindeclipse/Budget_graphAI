"use client";

interface BurnRateSummaryFooterProps {
  runningTotal: number;
  idealToday: number;
  projectedMonthEnd: number;
  budgetLimit: number;
  isCurrentMonth: boolean;
}

export function BurnRateSummaryFooter({
  runningTotal,
  idealToday,
  projectedMonthEnd,
  budgetLimit,
  isCurrentMonth,
}: BurnRateSummaryFooterProps) {
  return (
    <div className="mt-4 grid grid-cols-3 gap-2 border-t border-zinc-800/80 pt-3 text-center">
      <div>
        <span className="block text-[10px] font-medium tracking-wider text-zinc-500 uppercase">
          Витрачено
        </span>
        <span className="font-mono text-xs font-semibold text-zinc-200 tabular-nums">
          {runningTotal.toLocaleString("uk-UA")} ₴
        </span>
      </div>
      <div>
        <span className="block text-[10px] font-medium tracking-wider text-zinc-500 uppercase">
          {isCurrentMonth ? "План на сьогодні" : "План періоду"}
        </span>
        <span className="font-mono text-xs font-semibold text-zinc-200 tabular-nums">
          {idealToday.toLocaleString("uk-UA")} ₴
        </span>
      </div>
      <div>
        <span className="block text-[10px] font-medium tracking-wider text-zinc-500 uppercase">
          {isCurrentMonth ? "Очікуваний фініш" : "Підсумок"}
        </span>
        <span
          className={`font-mono text-xs font-semibold tabular-nums ${
            projectedMonthEnd > budgetLimit
              ? "text-rose-400"
              : "text-emerald-400"
          }`}
        >
          {projectedMonthEnd.toLocaleString("uk-UA")} ₴
        </span>
      </div>
    </div>
  );
}
