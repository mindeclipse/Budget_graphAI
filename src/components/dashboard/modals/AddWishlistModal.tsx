"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Clock, X, Loader2 } from "lucide-react";

interface AddWishlistModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => Promise<void> | void;
}

export function AddWishlistModal({
  isOpen,
  onClose,
  onSuccess,
}: AddWishlistModalProps) {
  const [mounted, setMounted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Стейт форми нового бажання
  const [title, setTitle] = useState("");
  const [estimatedPrice, setEstimatedPrice] = useState("");
  const [currency, setCurrency] = useState("UAH");
  const [categoryName, setCategoryName] = useState("Гаджети");
  const [url, setUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [coolingDays, setCoolingDays] = useState(14);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!isOpen || !mounted) return null;

  const handleCreateWish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !estimatedPrice || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/wishlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          estimated_price: parseFloat(estimatedPrice),
          currency,
          category_name: categoryName || "Інше",
          url: url.trim() || null,
          notes: notes.trim() || null,
          cooling_days: coolingDays,
        }),
      });

      if (!res.ok) throw new Error("Помилка додавання бажання");

      setTitle("");
      setEstimatedPrice("");
      setUrl("");
      setNotes("");
      setCoolingDays(14);
      onClose();
      await onSuccess();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />

      <div className="relative z-10 flex max-h-[90dvh] min-h-0 w-full max-w-md flex-col overscroll-contain rounded-t-[28px] border border-slate-800 bg-slate-900 shadow-2xl duration-200 sm:max-h-[85vh] sm:rounded-2xl">
        {/* Mobile handle indicator */}
        <div className="mx-auto mt-3 h-1.5 w-11 shrink-0 rounded-full bg-slate-700/50 sm:hidden" />

        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3.5 sm:px-6 sm:py-4">
          <h3 className="flex items-center gap-2 text-base font-semibold text-slate-100">
            <Clock className="h-5 w-5 text-violet-400" />
            Нове бажання на охолодження
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form
          onSubmit={handleCreateWish}
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <div className="flex-1 [scrollbar-width:thin] space-y-4 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">
                Що хочеться купити? *
              </label>
              <input
                type="text"
                required
                placeholder="напр. Навушники Sony WH-1000XM5"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-xl border border-slate-700/60 bg-slate-800/50 px-3.5 py-2.5 text-base text-slate-100 placeholder-slate-500 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 focus:outline-none sm:text-sm"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="mb-1 block text-xs font-medium text-slate-300">
                  Орієнтовна ціна *
                </label>
                <input
                  type="number"
                  step="any"
                  required
                  placeholder="0.00"
                  value={estimatedPrice}
                  onChange={(e) => setEstimatedPrice(e.target.value)}
                  className="w-full rounded-xl border border-slate-700/60 bg-slate-800/50 px-3.5 py-2.5 text-base text-slate-100 placeholder-slate-500 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 focus:outline-none sm:text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-300">
                  Валюта
                </label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="w-full rounded-xl border border-slate-700/60 bg-slate-800/50 px-3 py-2.5 text-base text-slate-100 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 focus:outline-none sm:text-sm"
                >
                  <option value="UAH">UAH ₴</option>
                  <option value="USD">USD $</option>
                  <option value="EUR">EUR €</option>
                  <option value="PLN">PLN zł</option>
                </select>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">
                Категорія
              </label>
              <select
                value={categoryName}
                onChange={(e) => setCategoryName(e.target.value)}
                className="w-full rounded-xl border border-slate-700/60 bg-slate-800/50 px-3.5 py-2.5 text-base text-slate-100 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 focus:outline-none sm:text-sm"
              >
                <option value="Гаджети">Гаджети та техніка</option>
                <option value="Одяг">Одяг та взуття</option>
                <option value="Дім">Дім та затишок</option>
                <option value="Розваги">Розваги та хобі</option>
                <option value="Спорт">Спорт та активність</option>
                <option value="Краса">Догляд та краса</option>
                <option value="Інше">Інше</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">
                Період охолодження
              </label>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { days: 3, label: "3 дні" },
                  { days: 7, label: "7 днів" },
                  { days: 14, label: "14 днів" },
                  { days: 30, label: "30 днів" },
                ].map((p) => (
                  <button
                    type="button"
                    key={p.days}
                    onClick={() => setCoolingDays(p.days)}
                    className={`rounded-xl border py-2 text-xs font-medium transition-all ${
                      coolingDays === p.days
                        ? "border-violet-500 bg-violet-600/30 text-violet-200"
                        : "border-slate-700 bg-slate-800/40 text-slate-400 hover:border-slate-600"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">
                Чому виникло це бажання? (Емоція / Тригер)
              </label>
              <input
                type="text"
                placeholder="напр. Побачив огляд на YouTube, чи справді воно мені треба?"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full rounded-xl border border-slate-700/60 bg-slate-800/50 px-3.5 py-2 text-base text-slate-100 placeholder-slate-500 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 focus:outline-none sm:text-xs"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">
                Посилання на товар (опціонально)
              </label>
              <input
                type="url"
                placeholder="https://..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="w-full rounded-xl border border-slate-700/60 bg-slate-800/50 px-3.5 py-2 text-base text-slate-100 placeholder-slate-500 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 focus:outline-none sm:text-xs"
              />
            </div>
          </div>

          <div className="flex shrink-0 items-center justify-end gap-3 border-t border-slate-800 px-5 py-3.5 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:px-6 sm:py-4 sm:pb-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-4 py-2 text-xs font-medium text-slate-400 hover:text-slate-100"
            >
              Скасувати
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2 text-xs font-semibold text-white hover:bg-violet-500 active:scale-95 disabled:opacity-50"
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Clock className="h-4 w-4" />
              )}
              Поставити на таймер
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
