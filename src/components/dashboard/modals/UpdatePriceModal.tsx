"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import {
  DollarSign,
  X,
  Loader2,
  TrendingDown,
  TrendingUp,
  History,
} from "lucide-react";
import { WishlistItem } from "@/types/finance";

interface UpdatePriceModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: WishlistItem;
  onSuccess: () => Promise<void> | void;
}

export function UpdatePriceModal({
  isOpen,
  onClose,
  item,
  onSuccess,
}: UpdatePriceModalProps) {
  const [newPrice, setNewPrice] = useState(String(item.estimated_price || ""));
  const [priceNotes, setPriceNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const initialPrice = Number(item.initial_price || item.estimated_price);
  const currentPrice = Number(newPrice) || Number(item.estimated_price);
  const priceDelta = currentPrice - initialPrice;
  const priceDeltaPct =
    initialPrice > 0 ? (priceDelta / initialPrice) * 100 : 0;

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedPrice = parseFloat(newPrice);
    if (isNaN(parsedPrice) || parsedPrice <= 0 || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/wishlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: item.id,
          action: "update_price",
          new_price: parsedPrice,
          price_source: "manual",
          price_notes: priceNotes.trim() || undefined,
        }),
      });

      if (!res.ok) throw new Error("Помилка оновлення ціни");

      await onSuccess();
      onClose();
    } catch (err) {
      console.error(err);
      await onSuccess();
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />

      <div className="relative z-10 flex max-h-[90dvh] min-h-0 w-full max-w-md flex-col overscroll-contain rounded-t-[28px] border border-slate-800 bg-slate-900 shadow-2xl duration-200 sm:max-h-[85vh] sm:rounded-2xl">
        <div className="mx-auto mt-3 h-1.5 w-11 shrink-0 rounded-full bg-slate-700/50 sm:hidden" />

        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3.5 sm:px-6 sm:py-4">
          <h3 className="flex items-center gap-2 text-base font-semibold text-slate-100">
            <DollarSign className="h-5 w-5 text-emerald-400" />
            Оновити ціну товару
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
          onSubmit={handleUpdate}
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4 sm:px-6">
            <div className="rounded-xl border border-slate-800 bg-slate-800/40 p-3">
              <div className="text-xs text-slate-400">Товар</div>
              <div className="font-semibold text-slate-100">{item.title}</div>
              <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
                <span>Стартова ціна:</span>
                <span className="font-medium text-slate-200">
                  {initialPrice.toLocaleString("uk-UA")} {item.currency}
                </span>
              </div>
              {item.target_price && (
                <div className="mt-1 flex items-center justify-between text-xs text-amber-400">
                  <span>Цільова ціна для покупки:</span>
                  <span className="font-bold">
                    {Number(item.target_price).toLocaleString("uk-UA")}{" "}
                    {item.currency}
                  </span>
                </div>
              )}
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">
                Актуальна вартість ({item.currency}) *
              </label>
              <input
                type="number"
                step="any"
                required
                value={newPrice}
                onChange={(e) => setNewPrice(e.target.value)}
                className="w-full rounded-xl border border-slate-700/60 bg-slate-800/50 px-3.5 py-2.5 text-base font-semibold text-slate-100 placeholder-slate-500 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 focus:outline-none sm:text-sm"
              />
            </div>

            {/* Динаміка ціни */}
            {initialPrice > 0 && Math.abs(priceDelta) > 0.01 && (
              <div
                className={`flex items-center justify-between rounded-xl border p-2.5 text-xs font-medium ${
                  priceDelta < 0
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                    : "border-rose-500/30 bg-rose-500/10 text-rose-300"
                }`}
              >
                <div className="flex items-center gap-1.5">
                  {priceDelta < 0 ? (
                    <TrendingDown className="h-4 w-4 text-emerald-400" />
                  ) : (
                    <TrendingUp className="h-4 w-4 text-rose-400" />
                  )}
                  <span>
                    {priceDelta < 0 ? "Ціна знизилася!" : "Ціна зросла"}
                  </span>
                </div>
                <div>
                  {priceDelta < 0 ? "-" : "+"}
                  {Math.abs(priceDelta).toLocaleString("uk-UA")} {item.currency}{" "}
                  ({priceDeltaPct.toFixed(1)}%)
                </div>
              </div>
            )}

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">
                Примітка до зміни (опціонально)
              </label>
              <input
                type="text"
                placeholder="напр. Знижка на вихідні / новий курс"
                value={priceNotes}
                onChange={(e) => setPriceNotes(e.target.value)}
                className="w-full rounded-xl border border-slate-700/60 bg-slate-800/50 px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 focus:outline-none"
              />
            </div>

            {/* Коротка історія цін */}
            {Array.isArray(item.price_history) &&
              item.price_history.length > 0 && (
                <div>
                  <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-slate-400">
                    <History className="h-3.5 w-3.5" />
                    Історія змін вартості
                  </div>
                  <div className="max-h-28 space-y-1 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950/40 p-2">
                    {item.price_history.map((pt, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between text-[11px] text-slate-400"
                      >
                        <span>
                          {new Date(pt.date).toLocaleDateString("uk-UA", {
                            day: "numeric",
                            month: "short",
                          })}
                          {pt.notes ? ` (${pt.notes})` : ""}
                        </span>
                        <span className="font-semibold text-slate-200">
                          {Number(pt.price).toLocaleString("uk-UA")}{" "}
                          {item.currency}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
          </div>

          <div className="flex shrink-0 items-center justify-end gap-3 border-t border-slate-800 px-5 py-3.5 sm:px-6 sm:py-4">
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
              className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 active:scale-95 disabled:opacity-50"
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <DollarSign className="h-4 w-4" />
              )}
              Зберегти нову ціну
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
