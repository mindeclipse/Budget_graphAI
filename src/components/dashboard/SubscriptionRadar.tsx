"use client";

import React, { useState, useMemo } from "react";
import {
  CalendarClock,
  Radio,
  Plus,
  Pencil,
  CheckCircle2,
  AlertCircle,
  Clock,
  EyeOff,
  Sparkles,
  Layers,
  ArrowUpRight,
} from "lucide-react";
import { RecurringItem } from "@/types/finance";
import {
  SubscriptionRadarResult,
  DetectedSubscription,
  UpcomingScheduleItem,
} from "@/lib/subscription-radar";

export interface SubscriptionRadarProps {
  recurring: RecurringItem[];
  radarData?: SubscriptionRadarResult;
  isLoading?: boolean;
  onAddRecurring: () => void;
  onEditRecurring: (item: RecurringItem) => void;
  onExecuteRecurring: (item: RecurringItem) => void;
  onAddDetected: (sub: DetectedSubscription) => void;
  onDismissDetected: (signature: string) => void;
}

export function SubscriptionRadar({
  recurring,
  radarData,
  isLoading,
  onAddRecurring,
  onEditRecurring,
  onExecuteRecurring,
  onAddDetected,
  onDismissDetected,
}: SubscriptionRadarProps) {
  const [activeTab, setActiveTab] = useState<"calendar" | "radar" | "all">(
    "calendar"
  );
  const [dismissedSignatures, setDismissedSignatures] = useState<string[]>([]);

  const detected = useMemo(() => {
    const raw = radarData?.detected || [];
    return raw.filter((sub) => !dismissedSignatures.includes(sub.id));
  }, [radarData?.detected, dismissedSignatures]);
  const upcoming = radarData?.upcoming || [];
  const metrics = radarData?.metrics;

  const totalMonthly =
    metrics?.monthly_total ||
    recurring.reduce((sum, r) => sum + Number(r.amount), 0);
  const totalAnnual = metrics?.annual_total || totalMonthly * 12;
  const remainingThisMonth = metrics?.remaining_this_month ?? 0;
  const paidThisMonth = metrics?.paid_this_month ?? 0;

  const paidCount = upcoming.filter((u) => u.status === "paid").length;
  const totalCount = upcoming.length;
  const progressPercent =
    totalCount > 0 ? Math.round((paidCount / totalCount) * 100) : 0;

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-900 bg-zinc-950 p-5 shadow-sm">
      {/* Верхній заголовок та перемикач вкладок */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-zinc-900 pb-4">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-violet-500/20 bg-violet-500/10 text-violet-400">
            <Radio size={15} />
          </div>
          <div>
            <h2 className="text-xs font-semibold tracking-wider text-zinc-300 uppercase">
              Радар підписок & Регулярні витрати
            </h2>
            <p className="text-[11px] text-zinc-500">
              Графік списань та автодетекція сервісів
            </p>
          </div>
        </div>

        <button
          onClick={onAddRecurring}
          className="flex items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-xs font-medium text-zinc-300 transition-all hover:border-zinc-700 hover:bg-zinc-800 hover:text-white"
        >
          <Plus size={13} /> Додати
        </button>
      </div>

      {/* Перемикач режимів перегляду */}
      <div className="mb-4 flex items-center gap-1.5 rounded-xl border border-zinc-900 bg-zinc-900/50 p-1">
        <button
          onClick={() => setActiveTab("calendar")}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium transition-all ${
            activeTab === "calendar"
              ? "bg-zinc-800 text-white shadow-sm"
              : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          <CalendarClock size={13} />
          <span>Календар ({upcoming.length})</span>
        </button>

        <button
          onClick={() => setActiveTab("radar")}
          className={`relative flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium transition-all ${
            activeTab === "radar"
              ? "bg-zinc-800 text-white shadow-sm"
              : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          <Radio size={13} />
          <span>Радар</span>
          {detected.length > 0 && (
            <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-violet-500 px-1 text-[10px] font-bold text-white">
              {detected.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab("all")}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium transition-all ${
            activeTab === "all"
              ? "bg-zinc-800 text-white shadow-sm"
              : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          <Layers size={13} />
          <span>Всі ({recurring.length})</span>
        </button>
      </div>

      {/* Вкладка 1: Календар списань поточного місяця */}
      {activeTab === "calendar" && (
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

          {upcoming.length === 0 ? (
            <div className="py-6 text-center text-xs text-zinc-600">
              Немає активних списань на цей місяць
            </div>
          ) : (
            <div className="space-y-2">
              {upcoming.map((item) => {
                const originalTemplate = recurring.find(
                  (r) => r.id === item.id
                );

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
      )}

      {/* Вкладка 2: Автоматичний радар виявлених підписок */}
      {activeTab === "radar" && (
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
                Радар проаналізував останні 180 днів виписки: всі знайдені
                підписки вже занесені або ще не мають регулярного патерну.
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
                        {sub.occurrences_count} оплат (інтервал ~
                        {sub.interval_days} дн.)
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
                      onClick={() => {
                        setDismissedSignatures((prev) => [...prev, sub.id]);
                        onDismissDetected(sub.id);
                      }}
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
      )}

      {/* Вкладка 3: Всі наявні шаблони підписок */}
      {activeTab === "all" && (
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
                    onClick={() => onExecuteRecurring(item)}
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
      )}

      {/* Нижня панель: Фінансове річне навантаження */}
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
    </div>
  );
}
