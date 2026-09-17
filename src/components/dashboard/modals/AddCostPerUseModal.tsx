"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { TrendingDown, X, Loader2 } from "lucide-react";
import { CostPerUseItem } from "@/types/finance";

interface AddCostPerUseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => Promise<void> | void;
  prefillItem?: Partial<CostPerUseItem> | null;
}

export function AddCostPerUseModal({
  isOpen,
  onClose,
  onSuccess,
  prefillItem = null,
}: AddCostPerUseModalProps) {
  const [mounted, setMounted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Стейт форми додавання речі
  const [itemName, setItemName] = useState(prefillItem?.item_name || "");
  const [purchasePrice, setPurchasePrice] = useState(
    prefillItem?.purchase_price ? String(prefillItem.purchase_price) : ""
  );
  const [currency, setCurrency] = useState(prefillItem?.currency || "UAH");
  const [categoryName, setCategoryName] = useState(
    prefillItem?.category_name || "Гаджети"
  );
  const [purchaseDate, setPurchaseDate] = useState(
    prefillItem?.purchase_date || new Date().toISOString().split("T")[0]
  );
  const [totalUses, setTotalUses] = useState("1");
  const [benchmarkCost, setBenchmarkCost] = useState("");
  const [targetCost, setTargetCost] = useState("");
  const [notes, setNotes] = useState(prefillItem?.notes || "");

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (prefillItem) {
      if (prefillItem.item_name) setItemName(prefillItem.item_name);
      if (prefillItem.purchase_price)
        setPurchasePrice(String(prefillItem.purchase_price));
      if (prefillItem.currency) setCurrency(prefillItem.currency);
      if (prefillItem.category_name) setCategoryName(prefillItem.category_name);
      if (prefillItem.notes) setNotes(prefillItem.notes);
    }
  }, [prefillItem]);

  if (!isOpen || !mounted) return null;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemName.trim() || !purchasePrice || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/cost-per-use", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item_name: itemName.trim(),
          purchase_price: parseFloat(purchasePrice),
          currency,
          category_name: categoryName || "Інше",
          purchase_date: purchaseDate,
          total_uses: totalUses ? parseInt(totalUses, 10) : 1,
          benchmark_cost_per_use: benchmarkCost
            ? parseFloat(benchmarkCost)
            : null,
          target_cost_per_use: targetCost ? parseFloat(targetCost) : null,
          notes: notes.trim() || null,
        }),
      });

      if (!res.ok) throw new Error("Помилка додавання речі");

      setItemName("");
      setPurchasePrice("");
      setBenchmarkCost("");
      setTargetCost("");
      setNotes("");
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

      <div className="relative z-10 flex max-h-[90dvh] w-full max-w-md flex-col overscroll-contain rounded-t-[28px] border border-slate-800 bg-slate-900 shadow-2xl duration-200 sm:max-h-[85vh] sm:rounded-2xl">
        {/* Mobile handle indicator */}
        <div className="mx-auto mt-3 h-1.5 w-11 shrink-0 rounded-full bg-slate-700/50 sm:hidden" />

        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3.5 sm:px-6 sm:py-4">
          <h3 className="flex items-center gap-2 text-base font-semibold text-slate-100">
            <TrendingDown className="h-5 w-5 text-cyan-400" />
            Нова річ для трекера окупності
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
          onSubmit={handleCreate}
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4 sm:px-6">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">
                Назва речі / обладнання *
              </label>
              <input
                type="text"
                required
                placeholder="напр. Кавоварка DeLonghi або Зимова куртка"
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
                className="w-full rounded-xl border border-slate-700/60 bg-slate-800/50 px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="mb-1 block text-xs font-medium text-slate-300">
                  Вартість покупки *
                </label>
                <input
                  type="number"
                  step="any"
                  required
                  placeholder="0.00"
                  value={purchasePrice}
                  onChange={(e) => setPurchasePrice(e.target.value)}
                  className="w-full rounded-xl border border-slate-700/60 bg-slate-800/50 px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-300">
                  Валюта
                </label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="w-full rounded-xl border border-slate-700/60 bg-slate-800/50 px-3 py-2.5 text-sm text-slate-100 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 focus:outline-none"
                >
                  <option value="UAH">UAH ₴</option>
                  <option value="USD">USD $</option>
                  <option value="EUR">EUR €</option>
                  <option value="PLN">PLN zł</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-300">
                  Категорія
                </label>
                <select
                  value={categoryName}
                  onChange={(e) => setCategoryName(e.target.value)}
                  className="w-full rounded-xl border border-slate-700/60 bg-slate-800/50 px-3.5 py-2.5 text-sm text-slate-100 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 focus:outline-none"
                >
                  <option value="Гаджети">Гаджети та техніка</option>
                  <option value="Одяг">Одяг та взуття</option>
                  <option value="Дім">Дім та кухня</option>
                  <option value="Спорт">Спорт та здоров'я</option>
                  <option value="Робота">Робочі інструменти</option>
                  <option value="Інше">Інше</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-300">
                  Поточна к-ть використань
                </label>
                <input
                  type="number"
                  min="1"
                  value={totalUses}
                  onChange={(e) => setTotalUses(e.target.value)}
                  className="w-full rounded-xl border border-slate-700/60 bg-slate-800/50 px-3.5 py-2.5 text-sm text-slate-100 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">
                Альтернативна вартість послуги / разового використання
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="any"
                  placeholder="напр. 70 ₴ за каву в кав'ярні чи 250 ₴ за зал"
                  value={benchmarkCost}
                  onChange={(e) => setBenchmarkCost(e.target.value)}
                  className="w-full rounded-xl border border-slate-700/60 bg-slate-800/50 px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 focus:outline-none"
                />
              </div>
              <p className="mt-1 text-[10px] text-slate-400">
                Допомагає розрахувати чисту грошову економію та окупність у
                відсотках.
              </p>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">
                Дата покупки
              </label>
              <input
                type="date"
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
                className="w-full rounded-xl border border-slate-700/60 bg-slate-800/50 px-3.5 py-2 text-xs text-slate-100 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-slate-800 px-5 py-3.5 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:px-6 sm:py-4 sm:pb-4">
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
              className="flex items-center gap-1.5 rounded-xl bg-cyan-600 px-4 py-2 text-xs font-semibold text-white hover:bg-cyan-500 active:scale-95 disabled:opacity-50"
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <TrendingDown className="h-4 w-4" />
              )}
              Почати відстеження
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
