"use client";

interface RadarSummaryFooterProps {
  totalMonthly: number;
  totalAnnual: number;
  remainingThisMonth: number;
}

export function RadarSummaryFooter({
  totalMonthly,
  totalAnnual,
  remainingThisMonth,
}: RadarSummaryFooterProps) {
  return (
    <div className="mt-4 grid grid-cols-2 gap-2 border-t border-zinc-900 pt-3 text-xs sm:grid-cols-3">
      <div className="rounded-xl border border-zinc-900 bg-zinc-900/20 p-2">
        <p className="text-[10px] text-zinc-500">На місяць</p>
        <p className="mt-0.5 font-bold text-zinc-200">
          {totalMonthly.toLocaleString("uk-UA")} ₴
        </p>
      </div>
      <div className="rounded-xl border border-zinc-900 bg-zinc-900/20 p-2">
        <p className="text-[10px] text-zinc-500">На рік (12 міс)</p>
        <p className="mt-0.5 font-bold text-violet-400">
          {totalAnnual.toLocaleString("uk-UA")} ₴
        </p>
      </div>
      <div className="col-span-2 rounded-xl border border-zinc-900 bg-zinc-900/20 p-2 sm:col-span-1">
        <p className="text-[10px] text-zinc-500">До сплати цього місяця</p>
        <p className="mt-0.5 font-bold text-amber-400">
          {remainingThisMonth.toLocaleString("uk-UA")} ₴
        </p>
      </div>
    </div>
  );
}
