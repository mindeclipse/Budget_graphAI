"use client";

import { useState, memo } from "react";
import { AlertTriangle, Pencil, Check, Calendar } from "lucide-react";
import { BudgetMetricsResult } from "@/hooks/useBudgetMetrics";
import { triggerHaptic } from "@/lib/haptics";

interface BudgetLimitCardProps {
  effectiveLimit: number;
  budgetMetrics: BudgetMetricsResult;
  onSaveBudget: (newLimit: number) => void | Promise<void>;
  onOpenCalendar?: () => void;
}

export const BudgetLimitCard = memo(function BudgetLimitCard({
  effectiveLimit,
  budgetMetrics,
  onSaveBudget,
  onOpenCalendar,
}: BudgetLimitCardProps) {
  const [isEditingBudget, setIsEditingBudget] = useState(false);
  const [tempBudgetInput, setTempBudgetInput] = useState(
    effectiveLimit.toString()
  );

  const spentPct = budgetMetrics.spentPercent || 0;
  const isDanger = spentPct >= 90;
  const isWarning = spentPct >= 70 && !isDanger;

  const progressGradient = isDanger
    ? "from-rose-600 to-rose-400"
    : isWarning
      ? "from-amber-500 to-amber-300"
      : "from-sky-500 to-emerald-400";

  const progressGlow = isDanger
    ? "shadow-[0_0_12px_rgba(244,63,94,0.35)]"
    : isWarning
      ? "shadow-[0_0_12px_rgba(245,158,11,0.3)]"
      : "shadow-[0_0_12px_rgba(52,211,153,0.25)]";

  const tooltipBadgeStyle = isDanger
    ? "border-rose-500/40 bg-rose-950/90 text-rose-300"
    : isWarning
      ? "border-amber-500/40 bg-amber-950/90 text-amber-300"
      : "border-zinc-800 bg-zinc-950/95 text-emerald-400";

  const handleSave = () => {
    const newLimit = parseFloat(tempBudgetInput.replace(",", "."));
    if (isNaN(newLimit) || newLimit <= 0) {
      setIsEditingBudget(false);
      return;
    }
    onSaveBudget(newLimit);
    setIsEditingBudget(false);
  };

  return (
    <section className="mb-8 rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold tracking-wider text-zinc-400 uppercase">
            Бюджет на місяць
          </span>
          {budgetMetrics.exactPercent > 100 && (
            <span className="flex items-center gap-1 rounded-full border border-rose-800/50 bg-rose-950/50 px-2 py-0.5 text-[11px] font-semibold text-rose-400">
              <AlertTriangle size={12} /> Переліміт
            </span>
          )}
        </div>

        {isEditingBudget ? (
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              inputMode="decimal"
              value={tempBudgetInput}
              onChange={(e) => setTempBudgetInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave();
                if (e.key === "Escape") setIsEditingBudget(false);
              }}
              className="w-24 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1 font-mono text-base text-white focus:border-emerald-500 focus:outline-none sm:w-28 sm:text-xs"
              autoFocus
            />
            <button
              type="button"
              onClick={handleSave}
              className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-600 text-white transition-all hover:bg-emerald-500 active:scale-95"
            >
              <Check size={14} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              setTempBudgetInput(effectiveLimit.toString());
              setIsEditingBudget(true);
            }}
            className="flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/80 px-2.5 py-1 text-xs text-zinc-400 transition-all hover:border-zinc-700 hover:text-white active:scale-95"
          >
            <span className="font-mono font-semibold text-zinc-200 tabular-nums">
              {effectiveLimit.toLocaleString("uk-UA")} ₴
            </span>
            <Pencil size={11} className="text-zinc-500" />
          </button>
        )}
      </div>

      {/* Інтерактивний прогрес-бар */}
      <div
        tabIndex={0}
        className="group relative -my-2 mb-4 cursor-pointer py-2 select-none focus:outline-none"
      >
        <div
          className={`pointer-events-none absolute -top-8 -translate-x-1/2 rounded-lg border px-2.5 py-1 font-mono text-[11px] opacity-0 shadow-2xl backdrop-blur-md transition-all duration-150 group-hover:-top-9 group-hover:opacity-100 group-focus:opacity-100 group-active:-top-9 group-active:opacity-100 ${tooltipBadgeStyle}`}
          style={{
            left: `${Math.min(90, Math.max(10, spentPct))}%`,
          }}
        >
          <div className="flex items-center gap-1.5 whitespace-nowrap">
            <span className="font-semibold tabular-nums">
              {spentPct.toFixed(1)}%
            </span>
            <span className="text-[10px] text-zinc-400">використано</span>
          </div>
          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 border-x-4 border-t-4 border-x-transparent border-t-current opacity-70" />
        </div>

        <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800/80 ring-1 ring-zinc-800">
          <div
            className={`h-full rounded-full bg-gradient-to-r ${progressGradient} ${progressGlow} transition-all duration-500`}
            style={{
              width: `${Math.min(100, spentPct)}%`,
            }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 border-t border-zinc-900 pt-1 text-xs sm:grid-cols-3">
        <div>
          <p className="mb-0.5 text-zinc-500">Залишок</p>
          <p
            className={`text-sm font-bold tabular-nums ${
              budgetMetrics.remaining < 0 ? "text-rose-400" : "text-white"
            }`}
          >
            {budgetMetrics.remaining.toLocaleString("uk-UA", {
              minimumFractionDigits: 2,
            })}{" "}
            ₴
          </p>
        </div>

        <div>
          <div className="mb-0.5 flex items-center gap-1.5">
            <p className="text-zinc-500">Безпечно на день</p>
            {budgetMetrics.isCurrentMonth &&
              budgetMetrics.safeWeekdaySpend !== undefined &&
              budgetMetrics.safeWeekdaySpend > 0 && (
                <span className="text-[10px] font-medium text-zinc-400">
                  ({budgetMetrics.isTodayWeekend ? "вихідний" : "будень"})
                </span>
              )}
          </div>
          <p className="text-sm font-bold tabular-nums">
            {budgetMetrics.isCurrentMonth
              ? `~ ${Math.round(budgetMetrics.safeDailySpend).toLocaleString("uk-UA")} ₴/д`
              : "Період минув"}
          </p>
          {budgetMetrics.isCurrentMonth &&
            budgetMetrics.safeWeekdaySpend > 0 && (
              <p className="mt-0.5 font-mono text-[10px] text-zinc-400">
                Будні:{" "}
                {Math.round(budgetMetrics.safeWeekdaySpend).toLocaleString(
                  "uk-UA"
                )}{" "}
                ₴ · Вихідні:{" "}
                {Math.round(budgetMetrics.safeWeekendSpend).toLocaleString(
                  "uk-UA"
                )}{" "}
                ₴
              </p>
            )}
        </div>

        <div className="col-span-2 flex items-center sm:col-span-1">
          <button
            type="button"
            onClick={() => {
              triggerHaptic("light");
              onOpenCalendar?.();
            }}
            title="Відкрити фінансовий календар циклу"
            className="group hover:bg-zinc-850 -ml-2 flex items-center gap-1.5 rounded-lg border border-transparent px-2 py-1 text-left text-zinc-400 transition-all hover:border-zinc-800 hover:text-white active:scale-95"
          >
            <Calendar
              size={13}
              className="shrink-0 text-zinc-500 transition-colors group-hover:text-emerald-400"
            />
            <span>
              {budgetMetrics.isCurrentMonth ? (
                <>
                  Залишилось{" "}
                  <strong className="text-zinc-200 tabular-nums group-hover:text-white">
                    {budgetMetrics.daysRemaining}
                  </strong>{" "}
                  дн.
                </>
              ) : (
                "Архівний період"
              )}
            </span>
          </button>
        </div>
      </div>
    </section>
  );
});
