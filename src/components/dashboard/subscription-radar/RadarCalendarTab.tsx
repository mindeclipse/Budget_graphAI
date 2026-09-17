"use client";

import { CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { RecurringItem } from "@/types/finance";
import { UpcomingScheduleItem } from "@/lib/subscription-radar";

interface RadarCalendarTabProps {
  sortedUpcoming: UpcomingScheduleItem[];
  recurring: RecurringItem[];
  paidThisMonth: number;
  paidCount: number;
  totalCount: number;
  progressPercent: number;
  onEditRecurring: (item: RecurringItem) => void;
  onExecuteRecurring: (item: RecurringItem) => void;
}

export function RadarCalendarTab({
  sortedUpcoming,
  recurring,
  paidThisMonth,
  paidCount,
  totalCount,
  progressPercent,
  onEditRecurring,
  onExecuteRecurring,
}: RadarCalendarTabProps) {
  return (
    <div className="space-y-3">
      {/* Міні-прогрес сплат за місяць */}
      {totalCount > 0 && (
        <div className="rounded-xl border border-zinc-900 bg-zinc-900/30 p-3">
          <div className="mb-1.5 flex items-center justify-between text-xs">
            <span className="text-zinc-400">
              Сплачено:{" "}
              <strong className="font-semibold text-zinc-200">
                {paidCount} з {totalCount}
              </strong>
            </span>
            <span className="font-medium text-emerald-400">
              {paidThisMonth.toLocaleString("uk-UA")} ₴ ({progressPercent}%)
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
            <div
              className="h-full rounded-full bg-gradient-to-r from-violet-500 to-emerald-500 transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      )}

      {sortedUpcoming.length === 0 ? (
        <div className="py-6 text-center text-xs text-zinc-600">
          Немає активних списань на цей місяць
        </div>
      ) : (
        <div className="space-y-2">
          {sortedUpcoming.map((item) => {
            const originalTemplate = recurring.find((r) => r.id === item.id);

            return (
              <div
                key={item.id}
                className={`group flex items-center justify-between rounded-xl border p-2.5 transition-all ${
                  item.status === "paid"
                    ? "border-emerald-900/30 bg-emerald-950/10 hover:border-emerald-900/50"
                    : item.status === "due_today"
                      ? "border-amber-700/50 bg-amber-950/20 hover:border-amber-600/60"
                      : item.status === "overdue"
                        ? "border-rose-900/30 bg-rose-950/10 hover:border-rose-900/50"
                        : "border-zinc-800/80 bg-zinc-900/40 hover:border-zinc-700 hover:bg-zinc-900/80"
                }`}
              >
                <div
                  onClick={() =>
                    originalTemplate && onEditRecurring(originalTemplate)
                  }
                  className="min-w-0 flex-1 cursor-pointer pr-2"
                >
                  <div className="flex items-center gap-2">
                    <p className="truncate text-xs font-semibold text-zinc-200 group-hover:text-white">
                      {item.title}
                    </p>
                    {item.status === "paid" && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400">
                        <CheckCircle2 size={10} /> Сплачено
                      </span>
                    )}
                    {item.status === "due_today" && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">
                        <Clock size={10} /> Сьогодні
                      </span>
                    )}
                    {item.status === "upcoming" && (
                      <span className="inline-flex items-center rounded-full bg-zinc-800 px-1.5 py-0.5 text-[10px] font-medium text-zinc-400">
                        Через {item.days_remaining} дн.
                      </span>
                    )}
                    {item.status === "overdue" && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-1.5 py-0.5 text-[10px] font-medium text-rose-400">
                        <AlertCircle size={10} /> Пропущено
                      </span>
                    )}
                  </div>
                  <p className="truncate text-[11px] text-zinc-500">
                    {item.day_of_month}-е число • {item.category_name}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <span
                    onClick={() =>
                      originalTemplate && onEditRecurring(originalTemplate)
                    }
                    className={`cursor-pointer text-xs font-bold hover:underline ${
                      item.status === "paid"
                        ? "text-emerald-400"
                        : "text-zinc-200"
                    }`}
                  >
                    {item.currency === "USD"
                      ? `$${Number(item.amount).toFixed(item.amount % 1 === 0 ? 0 : 2)}`
                      : `${Number(item.amount).toLocaleString("uk-UA")} ₴`}
                  </span>

                  {item.status !== "paid" && originalTemplate && (
                    <button
                      type="button"
                      onClick={() => onExecuteRecurring(originalTemplate)}
                      title="Провести платіж зараз"
                      className="rounded-lg border border-zinc-800 bg-zinc-800/60 p-1.5 text-zinc-400 transition-all hover:border-emerald-700/60 hover:bg-emerald-950/60 hover:text-emerald-400"
                    >
                      <CheckCircle2 size={13} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
