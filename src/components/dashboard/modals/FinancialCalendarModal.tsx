"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  X,
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Plus,
  Trash2,
  CheckCircle2,
  Circle,
  Bell,
  TrendingUp,
  CreditCard,
  Flag,
  Send,
  Loader2,
  CalendarDays,
} from "lucide-react";
import { toast } from "sonner";
import { triggerHaptic } from "@/lib/haptics";
import {
  CalendarTimelineItem,
  FinancialEvent,
  BudgetCycle,
} from "@/types/finance";

interface FinancialCalendarModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeCycle?: BudgetCycle | null;
  daysRemaining?: number;
}

const MONTH_NAMES_UK = [
  "Січень",
  "Лютий",
  "Березень",
  "Квітень",
  "Травень",
  "Червень",
  "Липень",
  "Серпень",
  "Вересень",
  "Жовтень",
  "Листопад",
  "Грудень",
];

const WEEKDAY_NAMES_UK = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];

function getLocalDateIso(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function FinancialCalendarModal({
  isOpen,
  onClose,
  activeCycle,
  daysRemaining,
}: FinancialCalendarModalProps) {
  const today = useMemo(() => new Date(), []);
  const [currentYear, setCurrentYear] = useState<number>(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState<number>(today.getMonth()); // 0-indexed
  const [selectedDateIso, setSelectedDateIso] = useState<string>(() =>
    getLocalDateIso(new Date())
  );

  const [events, setEvents] = useState<CalendarTimelineItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSendingTelegram, setIsSendingTelegram] = useState<boolean>(false);

  // Стан форми створення нової події
  const [isAddingEvent, setIsAddingEvent] = useState<boolean>(false);
  const [newTitle, setNewTitle] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [newType, setNewType] = useState<"expense" | "income" | "reminder">(
    "expense"
  );
  const [newIsRecurring, setNewIsRecurring] = useState(false);
  const [newNotifyDays, setNewNotifyDays] = useState<number[]>([7, 3, 1]);
  const [isSubmittingEvent, setIsSubmittingEvent] = useState(false);

  const monthParam = useMemo(() => {
    return `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}`;
  }, [currentYear, currentMonth]);

  // Завантаження подій
  const fetchEvents = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/calendar/events?month=${monthParam}`);
      if (!res.ok) throw new Error("Не вдалося завантажити події");
      const data = await res.json();
      setEvents(data.events || []);
    } catch (err: any) {
      console.error(err);
      toast.error("Помилка завантаження календаря");
    } finally {
      setIsLoading(false);
    }
  }, [monthParam]);

  useEffect(() => {
    if (isOpen) {
      fetchEvents();
    }
  }, [isOpen, fetchEvents]);

  // Закриття по Esc
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "unset";
    };
  }, [isOpen, onClose]);

  // Навігація по місяцях
  const handlePrevMonth = () => {
    triggerHaptic("selection");
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    triggerHaptic("selection");
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
  };

  const handleGoToday = () => {
    triggerHaptic("light");
    const now = new Date();
    setCurrentYear(now.getFullYear());
    setCurrentMonth(now.getMonth());
    setSelectedDateIso(getLocalDateIso(now));
  };

  // Розрахунок матриці календаря (Понеділок - першим)
  const calendarGrid = useMemo(() => {
    const firstDayOfMonth = new Date(currentYear, currentMonth, 1);
    const lastDayOfMonth = new Date(currentYear, currentMonth + 1, 0);

    // Monday-based index: 0 = Mon, 6 = Sun
    let startDayOfWeek = firstDayOfMonth.getDay() - 1;
    if (startDayOfWeek === -1) startDayOfWeek = 6;

    const totalDays = lastDayOfMonth.getDate();
    const todayIso = getLocalDateIso(today);

    const days: Array<{
      dayNumber: number;
      dateIso: string;
      isCurrentMonth: boolean;
      isInActiveCycle: boolean;
      isToday: boolean;
    }> = [];

    // Попередній місяць
    const prevMonthLastDay = new Date(currentYear, currentMonth, 0).getDate();
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const d = prevMonthLastDay - i;
      const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
      const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;
      const dateIso = `${prevYear}-${String(prevMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      days.push({
        dayNumber: d,
        dateIso,
        isCurrentMonth: false,
        isInActiveCycle: false,
        isToday: dateIso === todayIso,
      });
    }

    // Поточний місяць
    const cycleStart = activeCycle?.start_date
      ? activeCycle.start_date.slice(0, 10)
      : null;
    const cycleEnd = activeCycle?.end_date
      ? activeCycle.end_date.slice(0, 10)
      : null;

    for (let d = 1; d <= totalDays; d++) {
      const dateIso = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const inCycle = Boolean(
        cycleStart &&
        dateIso >= cycleStart &&
        (!cycleEnd || dateIso <= cycleEnd)
      );

      days.push({
        dayNumber: d,
        dateIso,
        isCurrentMonth: true,
        isInActiveCycle: inCycle,
        isToday: dateIso === todayIso,
      });
    }

    // Наступний місяць (доповнення до 35 або 42 днів)
    const remainingCells = (7 - (days.length % 7)) % 7;
    for (let d = 1; d <= remainingCells; d++) {
      const nextMonth = currentMonth === 11 ? 0 : currentMonth + 1;
      const nextYear = currentMonth === 11 ? currentYear + 1 : currentYear;
      const dateIso = `${nextYear}-${String(nextMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      days.push({
        dayNumber: d,
        dateIso,
        isCurrentMonth: false,
        isInActiveCycle: false,
        isToday: dateIso === todayIso,
      });
    }

    return days;
  }, [currentYear, currentMonth, today, activeCycle]);

  // Групування подій за датою
  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarTimelineItem[]>();
    events.forEach((ev) => {
      const list = map.get(ev.date) || [];
      list.push(ev);
      map.set(ev.date, list);
    });
    return map;
  }, [events]);

  // Події вибраного дня
  const selectedDayEvents = useMemo(() => {
    return eventsByDate.get(selectedDateIso) || [];
  }, [eventsByDate, selectedDateIso]);

  // Підсумок для вибраного дня
  const { dayExpenses, dayIncome } = useMemo(() => {
    let exp = 0;
    let inc = 0;
    selectedDayEvents.forEach((ev) => {
      if (ev.type === "expense" && ev.amount) exp += ev.amount;
      if (ev.type === "income" && ev.amount) inc += ev.amount;
    });
    return { dayExpenses: exp, dayIncome: inc };
  }, [selectedDayEvents]);

  // Створення власної події
  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) {
      toast.error("Введіть назву події");
      return;
    }

    setIsSubmittingEvent(true);
    try {
      const numAmount = newAmount
        ? parseFloat(newAmount.replace(",", "."))
        : null;
      const res = await fetch("/api/calendar/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTitle.trim(),
          amount: numAmount && !isNaN(numAmount) ? numAmount : null,
          currency: "UAH",
          event_date: selectedDateIso,
          is_recurring: newIsRecurring,
          event_type: newType,
          notify_days_before: newNotifyDays,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Помилка створення події");
      }

      triggerHaptic("success");
      toast.success("Подію успішно додано!");
      setNewTitle("");
      setNewAmount("");
      setIsAddingEvent(false);
      await fetchEvents();
    } catch (err: any) {
      triggerHaptic("error");
      toast.error(err.message || "Не вдалося додати подію");
    } finally {
      setIsSubmittingEvent(false);
    }
  };

  // Перемикання виконання кастомної події
  const handleToggleCompleted = async (ev: CalendarTimelineItem) => {
    const dbId = ev.metadata?.dbId;
    if (!dbId) return;

    triggerHaptic("selection");
    try {
      const res = await fetch("/api/calendar/events", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: dbId,
          is_completed: !ev.isCompleted,
        }),
      });

      if (!res.ok) throw new Error("Помилка оновлення");
      await fetchEvents();
    } catch {
      toast.error("Не вдалося оновити статус події");
    }
  };

  // Видалення кастомної події
  const handleDeleteEvent = async (ev: CalendarTimelineItem) => {
    const dbId = ev.metadata?.dbId;
    if (!dbId) return;

    if (!confirm(`Видалити подію «${ev.title}»?`)) return;

    triggerHaptic("warning");
    try {
      const res = await fetch(`/api/calendar/events?id=${dbId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Помилка видалення");
      toast.success("Подію видалено");
      await fetchEvents();
    } catch {
      toast.error("Не вдалося видалити подію");
    }
  };

  // Тестове надсилання Telegram-радару
  const handleSendTestTelegram = async () => {
    if (isSendingTelegram) return;
    setIsSendingTelegram(true);
    const toastId = toast.loading(
      "Надсилання фінансового радару в Telegram..."
    );
    try {
      const res = await fetch("/api/cron/calendar-alerts?force=true");
      const data = await res.json();
      if (!res.ok || data.error)
        throw new Error(data.error || "Помилка відправки");

      if (data.sent) {
        triggerHaptic("success");
        toast.success("Радар успішно надіслано в Telegram!", {
          id: toastId,
          description: `Знайдено подій на найближчі дні: ${data.alertsCount}`,
        });
      } else {
        toast.info("Перевірте TELEGRAM_BOT_TOKEN та CHAT_ID", {
          id: toastId,
          description: data.message || "Повідомлення не відправлено",
        });
      }
    } catch (err: any) {
      triggerHaptic("error");
      toast.error(err.message || "Помилка зв'язку з ботом", { id: toastId });
    } finally {
      setIsSendingTelegram(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-0 backdrop-blur-md transition-opacity sm:items-center sm:p-4">
      <div
        className="relative flex max-h-[92vh] w-full max-w-xl flex-col rounded-t-3xl border border-zinc-800 bg-zinc-950 p-4 text-zinc-100 shadow-2xl sm:rounded-3xl sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Заголовок модалки */}
        <div className="mb-3 flex items-center justify-between border-b border-zinc-800/80 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
              <CalendarDays size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-white sm:text-lg">
                Фінансовий Календар
              </h2>
              <p className="text-xs text-zinc-400">
                Горизонт бюджетного циклу, підписок та виплат
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleSendTestTelegram}
              disabled={isSendingTelegram}
              title="Надіслати тестовий радар у Telegram"
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900/80 text-zinc-400 transition-colors hover:border-sky-500/50 hover:text-sky-400 active:scale-95 disabled:opacity-50"
            >
              {isSendingTelegram ? (
                <Loader2 size={15} className="animate-spin text-sky-400" />
              ) : (
                <Send size={15} />
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900/80 text-zinc-400 transition-colors hover:border-zinc-700 hover:text-white active:scale-95"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Інформаційна плашка активного циклу */}
        {activeCycle && (
          <div className="mb-3 flex items-center justify-between rounded-xl border border-emerald-900/40 bg-emerald-950/20 px-3 py-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
              <span className="font-medium text-emerald-300">
                {activeCycle.name}
              </span>
            </div>
            <div className="flex items-center gap-2 text-zinc-400">
              {daysRemaining !== undefined && (
                <span className="rounded-md bg-emerald-950/60 px-2 py-0.5 font-mono text-[11px] font-semibold text-emerald-400">
                  Залишилось {daysRemaining} дн.
                </span>
              )}
              <span className="text-zinc-500">
                {activeCycle.start_date.slice(5, 10)} →{" "}
                {activeCycle.end_date ? activeCycle.end_date.slice(5, 10) : "∞"}
              </span>
            </div>
          </div>
        )}

        {/* Навігація по місяцях */}
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <h3 className="text-sm font-bold text-white">
              {MONTH_NAMES_UK[currentMonth]} {currentYear}
            </h3>
            <button
              type="button"
              onClick={handleGoToday}
              className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-2 py-0.5 text-[11px] text-zinc-400 hover:border-zinc-700 hover:text-white"
            >
              Сьогодні
            </button>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:text-white active:scale-95"
            >
              <ChevronLeft size={15} />
            </button>
            <button
              type="button"
              onClick={handleNextMonth}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:text-white active:scale-95"
            >
              <ChevronRight size={15} />
            </button>
          </div>
        </div>

        {/* Сітка календаря */}
        <div className="mb-3 rounded-2xl border border-zinc-800/80 bg-zinc-900/30 p-2.5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)]">
          {/* Дні тижня */}
          <div className="mb-1 grid grid-cols-7 text-center text-[11px] font-semibold text-zinc-500">
            {WEEKDAY_NAMES_UK.map((d, i) => (
              <div
                key={d}
                className={i >= 5 ? "text-amber-500/80" : "text-zinc-400"}
              >
                {d}
              </div>
            ))}
          </div>

          {/* Дні */}
          <div className="grid grid-cols-7 gap-1">
            {calendarGrid.map((cell, idx) => {
              const dayEvents = eventsByDate.get(cell.dateIso) || [];
              const isSelected = cell.dateIso === selectedDateIso;

              return (
                <button
                  key={`${cell.dateIso}-${idx}`}
                  type="button"
                  onClick={() => {
                    triggerHaptic("selection");
                    setSelectedDateIso(cell.dateIso);
                  }}
                  className={`relative flex min-h-[48px] flex-col items-center justify-between rounded-xl p-1 text-xs transition-all ${
                    !cell.isCurrentMonth
                      ? "text-zinc-600 opacity-30 hover:opacity-60"
                      : cell.isInActiveCycle
                        ? "text-zinc-200"
                        : "text-zinc-400"
                  } ${
                    isSelected
                      ? "border border-emerald-500/60 bg-emerald-950/70 font-bold text-white shadow-[0_0_12px_rgba(16,185,129,0.18)]"
                      : cell.isToday
                        ? "border border-emerald-500/30 bg-emerald-950/20 font-bold text-emerald-400"
                        : "border border-transparent hover:border-zinc-800 hover:bg-zinc-800/40"
                  }`}
                >
                  <span className="tabular-nums">{cell.dayNumber}</span>

                  {/* Маркери подій */}
                  <div className="flex h-3 items-center justify-center gap-0.5">
                    {dayEvents.slice(0, 3).map((ev) => {
                      let dotColor = "bg-sky-400";
                      if (ev.source === "recurring") dotColor = "bg-rose-400";
                      if (ev.source === "investment")
                        dotColor = "bg-emerald-400";
                      if (ev.source === "cycle") dotColor = "bg-amber-400";
                      if (ev.source === "custom") dotColor = "bg-violet-400";

                      return (
                        <span
                          key={ev.id}
                          className={`h-1.5 w-1.5 rounded-full ${dotColor} ${
                            ev.isCompleted ? "line-through opacity-30" : ""
                          }`}
                        />
                      );
                    })}
                    {dayEvents.length > 3 && (
                      <span className="text-[9px] font-bold text-zinc-400">
                        +{dayEvents.length - 3}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Легенда маркерів */}
        <div className="mb-3 flex flex-wrap items-center justify-center gap-3 text-[11px] text-zinc-400">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-rose-400" /> Підписка /
            Регулярні
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-400" /> Інвестиції
            / Виплата
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-violet-400" /> Власні події
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-amber-400" /> Межі циклу
          </span>
        </div>

        {/* Панель вибраного дня */}
        <div className="flex-1 overflow-y-auto rounded-2xl border border-zinc-800/80 bg-zinc-900/30 p-3 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)]">
          <div className="mb-2 flex items-center justify-between border-b border-zinc-800/80 pb-2">
            <div>
              <p className="text-xs font-semibold text-white capitalize">
                {(() => {
                  const [y, m, d] = selectedDateIso.split("-").map(Number);
                  return new Date(y, m - 1, d).toLocaleDateString("uk-UA", {
                    weekday: "short",
                    day: "numeric",
                    month: "long",
                  });
                })()}
              </p>
              <div className="flex items-center gap-2 text-[11px]">
                {dayExpenses > 0 && (
                  <span className="text-rose-400">
                    Витрати: -{dayExpenses.toLocaleString("uk-UA")} ₴
                  </span>
                )}
                {dayIncome > 0 && (
                  <span className="text-emerald-400">
                    Надходження: +{dayIncome.toLocaleString("uk-UA")} ₴
                  </span>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                triggerHaptic("selection");
                setIsAddingEvent((prev) => !prev);
              }}
              className="flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-400 transition-all hover:border-emerald-500/50 hover:bg-emerald-500/20 active:scale-95"
            >
              <Plus size={13} />
              <span>{isAddingEvent ? "Скасувати" : "Додати подію"}</span>
            </button>
          </div>

          {/* Форма створення події */}
          {isAddingEvent && (
            <form
              onSubmit={handleCreateEvent}
              className="mb-3 rounded-2xl border border-zinc-800/80 bg-zinc-950/80 p-3.5 text-xs shadow-inner"
            >
              <div className="mb-2">
                <label className="mb-1 block text-zinc-400">
                  Назва події *
                </label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="напр. Оплата інтернету, Податок ФОП, ОВДП..."
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-white placeholder-zinc-500 focus:border-emerald-500/60 focus:outline-none"
                  autoFocus
                />
              </div>

              <div className="mb-2 grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-zinc-400">
                    Сума (₴, опціонально)
                  </label>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={newAmount}
                    onChange={(e) => setNewAmount(e.target.value)}
                    placeholder="0"
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-white focus:border-emerald-500/60 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-zinc-400">Тип події</label>
                  <select
                    value={newType}
                    onChange={(e) => setNewType(e.target.value as any)}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-white focus:border-emerald-500/60 focus:outline-none"
                  >
                    <option value="expense">Списання / Витрата</option>
                    <option value="income">Надходження / Дохід</option>
                    <option value="reminder">Просте нагадування</option>
                  </select>
                </div>
              </div>

              <div className="mb-3 flex items-center justify-between">
                <label className="flex cursor-pointer items-center gap-2 text-zinc-300">
                  <input
                    type="checkbox"
                    checked={newIsRecurring}
                    onChange={(e) => setNewIsRecurring(e.target.checked)}
                    className="rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-0"
                  />
                  <span>Повторювати щомісяця</span>
                </label>

                <div className="flex items-center gap-1 text-[11px] text-zinc-400">
                  <Bell size={12} className="text-sky-400" />
                  <span>ТГ: за 7, 3, 1 дні</span>
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmittingEvent}
                className="w-full rounded-lg bg-emerald-600 py-1.5 font-medium text-white transition-colors hover:bg-emerald-500 active:scale-95 disabled:opacity-50"
              >
                {isSubmittingEvent ? "Збереження..." : "Зберегти подію"}
              </button>
            </form>
          )}

          {/* Список подій дня */}
          {isLoading ? (
            <div className="flex items-center justify-center py-6 text-zinc-500">
              <Loader2 size={18} className="mr-2 animate-spin" />
              <span>Завантаження подій...</span>
            </div>
          ) : selectedDayEvents.length === 0 ? (
            <p className="py-4 text-center text-xs text-zinc-500">
              На цей день фінансових подій не заплановано
            </p>
          ) : (
            <div className="space-y-2">
              {selectedDayEvents.map((ev) => {
                let badgeColor = "border-sky-800/40 bg-sky-950/30 text-sky-300";
                let Icon = CalendarIcon;

                if (ev.source === "recurring") {
                  badgeColor =
                    "border-rose-800/40 bg-rose-950/30 text-rose-300";
                  Icon = CreditCard;
                } else if (ev.source === "investment") {
                  badgeColor =
                    "border-emerald-800/40 bg-emerald-950/30 text-emerald-300";
                  Icon = TrendingUp;
                } else if (ev.source === "cycle") {
                  badgeColor =
                    "border-amber-800/40 bg-amber-950/30 text-amber-300";
                  Icon = Flag;
                } else if (ev.source === "custom") {
                  badgeColor =
                    "border-violet-800/40 bg-violet-950/30 text-violet-300";
                  Icon = Bell;
                }

                return (
                  <div
                    key={ev.id}
                    className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-950/70 p-2.5 text-xs transition-colors hover:border-zinc-700"
                  >
                    <div className="flex items-center gap-2.5">
                      {ev.source === "custom" ? (
                        <button
                          type="button"
                          onClick={() => handleToggleCompleted(ev)}
                          className="text-zinc-500 transition-colors hover:text-emerald-400"
                        >
                          {ev.isCompleted ? (
                            <CheckCircle2
                              size={16}
                              className="text-emerald-400"
                            />
                          ) : (
                            <Circle size={16} />
                          )}
                        </button>
                      ) : (
                        <div
                          className={`flex h-6 w-6 items-center justify-center rounded-lg border ${badgeColor}`}
                        >
                          <Icon size={12} />
                        </div>
                      )}

                      <div>
                        <p
                          className={`font-medium text-white ${
                            ev.isCompleted ? "text-zinc-500 line-through" : ""
                          }`}
                        >
                          {ev.title}
                        </p>
                        <p className="text-[10px] text-zinc-500">
                          {ev.source === "recurring"
                            ? "Регулярне списання / підписка"
                            : ev.source === "investment"
                              ? "Інвестиційна виплата"
                              : ev.source === "cycle"
                                ? "Бюджетний цикл"
                                : "Власна подія"}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {ev.amount !== null && ev.amount !== undefined && (
                        <span
                          className={`font-mono font-semibold tabular-nums ${
                            ev.type === "expense"
                              ? "text-rose-400"
                              : ev.type === "income"
                                ? "text-emerald-400"
                                : "text-zinc-300"
                          }`}
                        >
                          {ev.type === "expense"
                            ? "-"
                            : ev.type === "income"
                              ? "+"
                              : ""}
                          {ev.amount.toLocaleString("uk-UA")}{" "}
                          {ev.currency || "₴"}
                        </span>
                      )}

                      {ev.source === "custom" && (
                        <button
                          type="button"
                          onClick={() => handleDeleteEvent(ev)}
                          className="text-zinc-500 transition-colors hover:text-rose-400 active:scale-95"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
