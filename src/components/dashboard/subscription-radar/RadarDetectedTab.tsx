"use client";

import { Sparkles, EyeOff, Plus } from "lucide-react";
import { DetectedSubscription } from "@/lib/subscription-radar";

interface RadarDetectedTabProps {
  detected: DetectedSubscription[];
  onAddDetected: (sub: DetectedSubscription) => void;
  onDismissDetected: (sub: DetectedSubscription) => void;
}

export function RadarDetectedTab({
  detected,
  onAddDetected,
  onDismissDetected,
}: RadarDetectedTabProps) {
  return (
    <div className="space-y-3">
      {detected.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-800/80 bg-zinc-900/20 px-4 py-8 text-center">
          <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-zinc-800 text-zinc-400">
            <Sparkles size={16} />
          </div>
          <p className="text-xs font-semibold text-zinc-300">
            Нових регулярних списань не виявлено
          </p>
          <p className="mt-1 max-w-xs text-[11px] text-zinc-500">
            Радар проаналізував останні 180 днів виписки: всі знайдені підписки
            вже занесені або ще не мають регулярного патерну.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Знайдено підписок у виписці:</span>
            <span className="font-semibold text-violet-400">
              {detected.length}
            </span>
          </div>

          {detected.map((sub) => (
            <div
              key={sub.id}
              className="rounded-xl border border-violet-900/30 bg-violet-950/10 p-3 transition-all hover:border-violet-700/50"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-xs font-semibold text-zinc-100">
                      {sub.title}
                    </p>
                    <span className="rounded-full bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-medium text-violet-300">
                      {sub.confidence === "high"
                        ? "Регулярний патерн"
                        : "Схоже на підписку"}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-zinc-400">
                    Орієнтовно {sub.predicted_day_of_month}-го числа •{" "}
                    {sub.occurrences_count} оплат (інтервал ~{sub.interval_days}{" "}
                    дн.)
                  </p>
                </div>

                <div className="text-right">
                  <span className="text-xs font-bold text-white">
                    {sub.currency === "USD"
                      ? `$${sub.amount}`
                      : `${sub.amount.toLocaleString("uk-UA")} ₴`}
                  </span>
                </div>
              </div>

              <div className="mt-2.5 flex items-center justify-end gap-2 border-t border-violet-900/20 pt-2">
                <button
                  onClick={() => onDismissDetected(sub)}
                  className="flex items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-900/80 px-2 py-1 text-[11px] text-zinc-400 transition-all hover:bg-zinc-800 hover:text-zinc-200"
                >
                  <EyeOff size={11} /> Приховати
                </button>
                <button
                  onClick={() => onAddDetected(sub)}
                  className="flex items-center gap-1 rounded-lg bg-violet-600 px-2.5 py-1 text-[11px] font-semibold text-white transition-all hover:bg-violet-500"
                >
                  <Plus size={11} /> Додати в підписки
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
