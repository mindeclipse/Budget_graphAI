"use client";

import { Pencil, CheckCircle2 } from "lucide-react";
import { RecurringItem } from "@/types/finance";
import { triggerHaptic } from "@/lib/haptics";

interface RadarAllTemplatesTabProps {
  recurring: RecurringItem[];
  onEditRecurring: (item: RecurringItem) => void;
  onExecuteRecurring: (item: RecurringItem) => void;
}

export function RadarAllTemplatesTab({
  recurring,
  onEditRecurring,
  onExecuteRecurring,
}: RadarAllTemplatesTabProps) {
  return (
    <div className="space-y-2">
      {recurring.length === 0 ? (
        <p className="py-4 text-center text-xs text-zinc-600">
          Немає збережених шаблонів витрат
        </p>
      ) : (
        recurring.map((item) => (
          <div
            key={item.id}
            className="group flex items-center justify-between rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-2.5 transition-all hover:border-zinc-700 hover:bg-zinc-900/80"
          >
            <div
              onClick={() => onEditRecurring(item)}
              className="min-w-0 flex-1 cursor-pointer pr-2"
            >
              <div className="flex items-center gap-1.5">
                <p className="truncate text-xs font-semibold text-zinc-200 group-hover:text-white">
                  {item.title}
                </p>
                <Pencil
                  size={11}
                  className="shrink-0 text-zinc-600 group-hover:text-zinc-400"
                />
              </div>
              <p className="truncate text-[11px] text-zinc-500">
                {item.day_of_month}-е число • {item.category_name}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <span
                onClick={() => onEditRecurring(item)}
                className="cursor-pointer text-xs font-bold text-white hover:underline"
              >
                {item.currency === "USD"
                  ? `$${Number(item.amount).toFixed(item.amount % 1 === 0 ? 0 : 2)}`
                  : `${Number(item.amount).toLocaleString("uk-UA")} ₴`}
              </span>
              <button
                type="button"
                onClick={() => {
                  triggerHaptic("success");
                  onExecuteRecurring(item);
                }}
                title="Провести платіж зараз"
                className="rounded-lg border border-zinc-800 bg-zinc-800/60 p-1.5 text-zinc-400 transition-all hover:border-emerald-700/60 hover:bg-emerald-950/60 hover:text-emerald-400"
              >
                <CheckCircle2 size={13} />
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
