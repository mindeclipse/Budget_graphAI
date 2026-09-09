"use client";

import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";

interface PeriodNavProps {
  monthLabel: string;
  onPrevMonth: () => void;
  onNextMonth: () => void;
}

export function PeriodNav({
  monthLabel,
  onPrevMonth,
  onNextMonth,
}: PeriodNavProps) {
  return (
    <div className="mb-2.5 flex items-center justify-between rounded-xl border border-zinc-900 bg-zinc-950 px-3 py-1.5 shadow-sm">
      <button
        type="button"
        onClick={onPrevMonth}
        className="relative flex h-8 w-8 items-center justify-center rounded-xl border border-zinc-800/90 bg-zinc-900/80 text-zinc-400 after:absolute after:-inset-2 after:content-[''] active:scale-95"
      >
        <ChevronLeft size={16} />
      </button>
      <div className="flex items-center gap-2">
        <Calendar size={13} className="text-zinc-500" />
        <span className="text-xs font-semibold text-zinc-200 capitalize">
          {monthLabel}
        </span>
      </div>
      <button
        type="button"
        onClick={onNextMonth}
        className="relative flex h-8 w-8 items-center justify-center rounded-xl border border-zinc-800/90 bg-zinc-900/80 text-zinc-400 after:absolute after:-inset-2 after:content-[''] active:scale-95"
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );
}
