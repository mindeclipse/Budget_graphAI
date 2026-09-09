"use client";

import React, { useState, useEffect } from "react";
import { X, Calendar, RotateCcw, ArrowRight, Loader2 } from "lucide-react";

interface NewCycleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCycleStarted: () => void;
  defaultLimit?: number;
}

export function NewCycleModal({
  isOpen,
  onClose,
  onCycleStarted,
  defaultLimit = 35000,
}: NewCycleModalProps) {
  const [name, setName] = useState(
    `Зарплатний цикл ${new Date().toLocaleDateString("uk-UA", { month: "long" })}`
  );
  const [limit, setLimit] = useState<number>(defaultLimit);
  const [startDate, setStartDate] = useState(
    new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16)
  );
  const [loading, setLoading] = useState(false);

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

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!limit || isNaN(limit) || limit <= 0 || limit > 100_000_000) {
      alert("Вкажіть коректний ліміт від 1 до 100,000,000 ₴");
      return;
    }

    const parsedDate = new Date(startDate);
    if (isNaN(parsedDate.getTime())) {
      alert("Вкажіть коректний час початку циклу");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/cycles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim().slice(0, 100) || "Новий цикл",
          budget_limit: limit,
          start_date: parsedDate.toISOString(),
        }),
      });

      if (!res.ok) throw new Error("Не вдалося запустити цикл");

      onCycleStarted();
      onClose();
    } catch (err) {
      console.error(err);
      alert("Помилка створення циклу");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      {/* Клік по бекдропу закриває вікно */}
      <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />

      {/* Адаптивна шторка для iPhone / Центрована картка для десктопу */}
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-md flex-col overscroll-contain rounded-t-[28px] border border-zinc-800 bg-zinc-950 p-5 pt-3 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl sm:max-h-[85vh] sm:rounded-3xl sm:p-6 sm:pb-6">
        {/* Grabber Bar для iOS */}
        <div className="mx-auto mb-3 h-1.5 w-11 shrink-0 rounded-full bg-zinc-700/50 sm:hidden" />

        {/* Шапка модалки */}
        <div className="mb-4 flex items-start justify-between border-b border-zinc-800/80 pb-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-sky-500/10 text-sky-400">
              <RotateCcw size={16} />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                Новий розрахунковий цикл
              </h3>
              <p className="text-[11px] text-zinc-400">
                Попередній цикл буде закрито з фіксацією залишку
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900/60 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white active:scale-95"
          >
            <X size={16} />
          </button>
        </div>

        {/* Форма запуску циклу */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold tracking-wider text-zinc-400 uppercase">
              Назва циклу
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl border border-zinc-800 bg-zinc-900/80 px-3.5 py-2.5 text-base text-white placeholder-zinc-600 transition-colors focus:border-zinc-600 focus:outline-none sm:text-xs"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-[11px] font-semibold tracking-wider text-zinc-400 uppercase">
              Плановий ліміт витрат
            </label>
            <div className="relative flex items-center">
              <input
                type="number"
                inputMode="decimal"
                required
                min={1}
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
                className="w-full rounded-xl border border-zinc-800 bg-zinc-900/80 px-3.5 py-2.5 pr-12 font-mono text-base font-semibold text-white tabular-nums transition-colors focus:border-zinc-600 focus:outline-none sm:text-xs"
              />
              <span className="pointer-events-none absolute right-3.5 font-mono text-xs font-medium text-zinc-500">
                ₴
              </span>
            </div>
          </div>

          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-zinc-400 uppercase">
              <Calendar size={12} className="text-zinc-500" /> Точний час старту
            </label>
            <input
              type="datetime-local"
              required
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-xl border border-zinc-800 bg-zinc-900/80 px-3.5 py-2.5 font-mono text-base text-white [color-scheme:dark] transition-colors focus:border-zinc-600 focus:outline-none sm:text-xs"
            />
            <p className="mt-1 text-[11px] text-zinc-500">
              Усі транзакції після цього часу потраплять у новий цикл.
            </p>
          </div>

          {/* Кнопки дій */}
          <div className="flex gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="h-10 flex-1 rounded-xl border border-zinc-800 bg-zinc-900/60 text-xs font-semibold text-zinc-400 transition-all hover:bg-zinc-800 hover:text-white active:scale-95"
            >
              Скасувати
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-sky-600 text-xs font-bold text-white shadow-lg shadow-sky-950/40 transition-all hover:bg-sky-500 active:scale-95 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  <span>Запуск...</span>
                </>
              ) : (
                <>
                  <span>Запустити</span>
                  <ArrowRight size={14} />
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
