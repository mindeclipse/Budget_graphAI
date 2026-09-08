"use client";

import React, { useState } from "react";
import { X, Calendar, DollarSign, ArrowRight } from "lucide-react";

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

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch("/api/cycles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          budget_limit: limit,
          start_date: new Date(startDate).toISOString(),
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs">
      <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-white">
              Почати новий зарплатний цикл
            </h3>
            <p className="text-xs text-zinc-400">
              Попередній цикл буде закрито з фіксацією залишку
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-900 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold text-zinc-300 uppercase">
              Назва циклу
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3.5 py-2.5 text-xs text-white placeholder-zinc-500 focus:border-zinc-700 focus:outline-hidden"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-zinc-300 uppercase">
              Плановий ліміт витрат (₴)
            </label>
            <div className="relative flex items-center">
              <input
                type="number"
                required
                min={1}
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
                className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3.5 py-2.5 text-xs font-semibold text-white focus:border-zinc-700 focus:outline-hidden"
              />
              <span className="absolute right-3.5 font-mono text-xs text-zinc-500">
                UAH
              </span>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-zinc-300 uppercase">
              Точний час старту
            </label>
            <input
              type="datetime-local"
              required
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3.5 py-2.5 text-xs text-white focus:border-zinc-700 focus:outline-hidden"
            />
            <p className="mt-1 text-[11px] text-zinc-500">
              Усі транзакції після цього часу потраплять у новий цикл.
            </p>
          </div>

          <div className="mt-6 flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-zinc-800 bg-zinc-900 py-2.5 text-xs font-semibold text-zinc-400 hover:bg-zinc-800 hover:text-white"
            >
              Скасувати
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-sky-500 py-2.5 text-xs font-semibold text-white transition-all hover:bg-sky-400 disabled:opacity-50"
            >
              <span>{loading ? "Запуск..." : "Запустити"}</span>
              <ArrowRight size={14} />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
