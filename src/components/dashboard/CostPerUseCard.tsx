"use client";

import { useState } from "react";
import {
  Sparkles,
  Plus,
  Zap,
  TrendingDown,
  Award,
  Trash2,
  Coffee,
  CheckCircle2,
  Calendar,
  X,
  Loader2,
  Tag,
} from "lucide-react";
import { CostPerUseItem } from "@/types/finance";

interface CostPerUseCardProps {
  items: CostPerUseItem[];
  totalMoneySaved?: number;
  onRefresh: () => void | Promise<void>;
  prefillItem?: Partial<CostPerUseItem> | null;
  onClearPrefill?: () => void;
}

export function CostPerUseCard({
  items,
  totalMoneySaved = 0,
  onRefresh,
  prefillItem = null,
  onClearPrefill,
}: CostPerUseCardProps) {
  const [isAddModalOpen, setIsAddModalOpen] = useState(Boolean(prefillItem));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loggingId, setLoggingId] = useState<number | null>(null);

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

  // Підрахунок сумарної економії та вкладень
  const computedSaved = items.reduce((acc, item) => {
    const uses = Math.max(1, item.total_uses || 1);
    if (
      item.benchmark_cost_per_use &&
      Number(item.benchmark_cost_per_use) > 0
    ) {
      const benchmarkTotal = Number(item.benchmark_cost_per_use) * uses;
      return acc + Math.max(0, benchmarkTotal - Number(item.purchase_price));
    }
    return acc;
  }, 0);

  const finalSaved = totalMoneySaved || Math.round(computedSaved);

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
      setIsAddModalOpen(false);
      if (onClearPrefill) onClearPrefill();
      await onRefresh();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogUse = async (id: number) => {
    setLoggingId(id);
    try {
      const res = await fetch("/api/cost-per-use", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "log_use", increment: 1 }),
      });
      if (!res.ok) throw new Error("Помилка оновлення");
      await onRefresh();
    } catch (err) {
      console.error(err);
    } finally {
      setLoggingId(null);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Ви дійсно хочете видалити цей актив із трекера?")) return;
    try {
      const res = await fetch(`/api/cost-per-use?id=${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Помилка видалення");
      await onRefresh();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="flex flex-col justify-between rounded-2xl border border-slate-800/80 bg-slate-900/60 p-6 shadow-xl backdrop-blur-xl">
      <div>
        {/* Заголовок */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/60 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-500/20 bg-cyan-500/10 text-cyan-400">
              <TrendingDown className="h-5 w-5" />
            </div>
            <div>
              <h3 className="flex items-center gap-2 text-base font-semibold text-slate-100">
                Окупність речей (Cost-per-Use)
              </h3>
              <p className="text-xs text-slate-400">
                Вартість за 1 використання зменшується щодня
              </p>
            </div>
          </div>

          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-1.5 rounded-xl bg-cyan-600 px-3.5 py-2 text-xs font-medium text-white shadow-lg shadow-cyan-600/20 transition-all hover:bg-cyan-500 active:scale-95"
          >
            <Plus className="h-4 w-4" />
            Додати річ
          </button>
        </div>

        {/* Банер сумарної економії */}
        <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-cyan-500/20 bg-cyan-500/10 p-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500/20 text-cyan-400">
              <Award className="h-4 w-4" />
            </div>
            <div>
              <span className="text-xs font-medium text-cyan-300">
                Збережено на сервісах та закладах
              </span>
              <div className="text-lg font-bold text-cyan-400">
                +{finalSaved.toLocaleString("uk-UA")} ₴
              </div>
            </div>
          </div>
          <div className="hidden text-right text-xs text-slate-400 sm:block">
            <div>
              На обліку:{" "}
              <span className="font-semibold text-slate-200">
                {items.length}
              </span>{" "}
              речей
            </div>
            <div>Ціна падає з кожним днем ⚡</div>
          </div>
        </div>

        {/* Список речей на обліку */}
        <div className="mt-4 max-h-[430px] space-y-3 overflow-y-auto pr-1">
          {items.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500">
              Ще немає речей на обліку. Додайте кофемашину, куртку чи робочі
              інструменти!
            </div>
          ) : (
            items.map((item) => {
              const uses = Math.max(1, Number(item.total_uses || 1));
              const price = Number(item.purchase_price || 0);
              const currentCost = Math.round((price / uses) * 100) / 100;

              let moneySaved = 0;
              let roiPercent = 0;
              if (
                item.benchmark_cost_per_use &&
                Number(item.benchmark_cost_per_use) > 0
              ) {
                const benchmark = Number(item.benchmark_cost_per_use);
                moneySaved = Math.max(0, benchmark * uses - price);
                roiPercent = Math.round(((benchmark * uses) / price) * 100);
              }

              const isLogging = loggingId === item.id;

              return (
                <div
                  key={item.id}
                  className="group relative rounded-xl border border-slate-800/70 bg-slate-800/30 p-3.5 transition-all hover:border-slate-700"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-slate-100">
                          {item.item_name}
                        </span>
                        <span className="rounded-md bg-slate-800 px-2 py-0.5 text-[10px] font-medium text-slate-400">
                          {item.category_name}
                        </span>
                      </div>

                      <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-400">
                        <span>
                          Куплено: {price.toLocaleString("uk-UA")}{" "}
                          {item.currency}
                        </span>
                        <span>•</span>
                        <span className="font-semibold text-slate-200">
                          {uses}{" "}
                          {uses === 1
                            ? "використання"
                            : uses < 5
                              ? "використання"
                              : "використань"}
                        </span>
                      </div>
                    </div>

                    {/* Поточна вартість за раз */}
                    <div className="text-right">
                      <div className="text-xs text-slate-400">
                        Ціна за 1 раз:
                      </div>
                      <div className="text-base font-bold text-cyan-400">
                        {currentCost.toLocaleString("uk-UA")} {item.currency}
                      </div>
                    </div>
                  </div>

                  {/* Окупність та Бенчмарк */}
                  {item.benchmark_cost_per_use && (
                    <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-800/60 pt-2 text-[11px]">
                      <div className="flex items-center gap-1.5 text-slate-300">
                        <Coffee className="h-3 w-3 text-amber-400" />
                        <span>
                          Аналог:{" "}
                          {Number(item.benchmark_cost_per_use).toLocaleString(
                            "uk-UA"
                          )}{" "}
                          {item.currency}
                        </span>
                        {roiPercent >= 100 ? (
                          <span className="rounded-full border border-emerald-500/30 bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                            Окупилася на {roiPercent}% (+
                            {Math.round(moneySaved)} ₴)
                          </span>
                        ) : (
                          <span className="text-cyan-400">
                            Окупність: {roiPercent}%
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Кнопки дій */}
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <button
                      onClick={() => handleLogUse(item.id)}
                      disabled={isLogging}
                      className="flex items-center gap-1.5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold text-cyan-300 transition-all hover:bg-cyan-500/20 active:scale-95 disabled:opacity-50"
                    >
                      {isLogging ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Zap className="h-3.5 w-3.5 text-cyan-400" />
                      )}
                      +1 Використання
                    </button>

                    <button
                      onClick={() => handleDelete(item.id)}
                      className="p-1 text-slate-500 transition-colors hover:text-rose-400"
                      title="Видалити з трекера"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Модальне вікно додавання нової речі */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="animate-in fade-in zoom-in-95 w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl duration-200">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="flex items-center gap-2 text-base font-semibold text-slate-100">
                <TrendingDown className="h-5 w-5 text-cyan-400" />
                Нова річ для трекера окупності
              </h3>
              <button
                onClick={() => {
                  setIsAddModalOpen(false);
                  if (onClearPrefill) onClearPrefill();
                }}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="mt-4 space-y-4">
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
                    className="w-full rounded-xl border border-slate-700/60 bg-slate-800/50 px-3 py-2.5 text-sm text-slate-100 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 focus:outline-none"
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

              <div className="flex items-center justify-end gap-3 border-t border-slate-800 pt-3">
                <button
                  type="button"
                  onClick={() => {
                    setIsAddModalOpen(false);
                    if (onClearPrefill) onClearPrefill();
                  }}
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
        </div>
      )}
    </div>
  );
}
