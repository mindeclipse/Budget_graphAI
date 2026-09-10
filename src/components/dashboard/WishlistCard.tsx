"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  Clock,
  Plus,
  ShieldCheck,
  Sparkles,
  ExternalLink,
  Trash2,
  CheckCircle2,
  ShoppingBag,
  X,
  Loader2,
} from "lucide-react";
import { WishlistItem } from "@/types/finance";

interface WishlistCardProps {
  items: WishlistItem[];
  savedAmount?: number;
  onRefresh: () => void | Promise<void>;
  onConvertToCostPerUse?: (item: WishlistItem) => void;
}

export function WishlistCard({
  items,
  savedAmount = 0,
  onRefresh,
  onConvertToCostPerUse,
}: WishlistCardProps) {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [filter, setFilter] = useState<
    "all" | "cooling" | "ready" | "saved" | "purchased"
  >("all");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Стейт форми нового бажання
  const [title, setTitle] = useState("");
  const [estimatedPrice, setEstimatedPrice] = useState("");
  const [currency, setCurrency] = useState("UAH");
  const [categoryName, setCategoryName] = useState("Гаджети");
  const [url, setUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [coolingDays, setCoolingDays] = useState(14);

  // Підрахунок метрик
  const totalSaved =
    savedAmount ||
    items
      .filter((i) => i.status === "saved")
      .reduce((sum, i) => sum + Number(i.estimated_price || 0), 0);

  const coolingItems = items.filter((i) => i.status === "cooling");
  const readyItems = items.filter((i) => i.status === "ready");

  const filteredItems = items.filter((i) => {
    if (filter === "all") return true;
    return i.status === filter;
  });

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
      setIsAddModalOpen(false);
      await onRefresh();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResolve = async (
    id: number,
    action: "saved" | "purchased" | "extend",
    extendDays = 7,
    item?: WishlistItem
  ) => {
    try {
      const res = await fetch("/api/wishlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action, extend_days: extendDays }),
      });
      if (!res.ok) throw new Error("Помилка оновлення статусу");
      await onRefresh();

      if (action === "purchased" && item && onConvertToCostPerUse) {
        onConvertToCostPerUse(item);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Ви дійсно хочете видалити це бажання?")) return;
    try {
      const res = await fetch(`/api/wishlist?id=${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Помилка видалення");
      await onRefresh();
    } catch (err) {
      console.error(err);
    }
  };

  const calculateRemainingDays = (endDateStr: string, totalDays: number) => {
    const end = new Date(endDateStr).getTime();
    const now = Date.now();
    const diffMs = end - now;
    const diffDays = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
    const passedDays = Math.max(0, totalDays - diffDays);
    const progressPercent = Math.min(
      100,
      Math.max(0, Math.round((passedDays / totalDays) * 100))
    );
    return { diffDays, progressPercent };
  };

  return (
    <div className="flex flex-col justify-between rounded-2xl border border-slate-800/80 bg-slate-900/60 p-6 shadow-xl backdrop-blur-xl">
      <div>
        {/* Заголовок */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/60 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-violet-500/20 bg-violet-500/10 text-violet-400">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <h3 className="flex items-center gap-2 text-base font-semibold text-slate-100">
                Лист очікування (Анти-імпульс)
                {readyItems.length > 0 && (
                  <span className="flex h-2 w-2 animate-pulse rounded-full bg-amber-400" />
                )}
              </h3>
              <p className="text-xs text-slate-400">
                Таймер охолодження проти спонтанних покупок
              </p>
            </div>
          </div>

          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-1.5 rounded-xl bg-violet-600 px-3.5 py-2 text-xs font-medium text-white shadow-lg shadow-violet-600/20 transition-all hover:bg-violet-500 active:scale-95"
          >
            <Plus className="h-4 w-4" />
            Додати бажання
          </button>
        </div>

        {/* Банер заощаджених грошей */}
        <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <div>
              <span className="text-xs font-medium text-emerald-300">
                Врятовано від імпульсивних покупок
              </span>
              <div className="text-lg font-bold text-emerald-400">
                {totalSaved.toLocaleString("uk-UA")} ₴
              </div>
            </div>
          </div>
          <div className="hidden text-right text-xs text-slate-400 sm:block">
            <div>
              На паузі:{" "}
              <span className="font-semibold text-slate-200">
                {coolingItems.length}
              </span>
            </div>
            <div>
              До рішення:{" "}
              <span className="font-semibold text-amber-400">
                {readyItems.length}
              </span>
            </div>
          </div>
        </div>

        {/* Фільтри */}
        <div className="mt-4 flex flex-wrap gap-1.5 border-b border-slate-800/60 pb-3">
          {(
            [
              { key: "all", label: `Всі (${items.length})` },
              { key: "cooling", label: `Охолодження (${coolingItems.length})` },
              { key: "ready", label: `Готові (${readyItems.length})` },
              {
                key: "saved",
                label: `Врятовані (${items.filter((i) => i.status === "saved").length})`,
              },
              {
                key: "purchased",
                label: `Куплені (${items.filter((i) => i.status === "purchased").length})`,
              },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              onClick={() => setFilter(t.key)}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                filter === t.key
                  ? "border border-violet-500/30 bg-violet-600/20 text-violet-300"
                  : "text-slate-400 hover:bg-slate-800/40 hover:text-slate-200"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Список бажань */}
        <div className="mt-4 max-h-[380px] space-y-3 overflow-y-auto pr-1">
          {filteredItems.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500">
              {filter === "all"
                ? "Лист бажань порожній. Додайте спонтанне бажання на охолодження!"
                : "Немає бажань у цьому статусі."}
            </div>
          ) : (
            filteredItems.map((item) => {
              const isCooling = item.status === "cooling";
              const isReady = item.status === "ready";
              const isSaved = item.status === "saved";
              const isPurchased = item.status === "purchased";
              const { diffDays, progressPercent } = calculateRemainingDays(
                item.cooling_end_date,
                item.cooling_days
              );

              return (
                <div
                  key={item.id}
                  className={`group relative rounded-xl border p-3.5 transition-all ${
                    isReady
                      ? "border-amber-500/40 bg-amber-500/5 hover:border-amber-500/60"
                      : isSaved
                        ? "border-emerald-500/20 bg-emerald-500/5"
                        : isPurchased
                          ? "border-slate-800 bg-slate-800/20 opacity-70"
                          : "border-slate-800/70 bg-slate-800/30 hover:border-slate-700"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-slate-100">
                          {item.title}
                        </span>
                        <span className="rounded-md bg-slate-800 px-2 py-0.5 text-[10px] font-medium text-slate-400">
                          {item.category_name}
                        </span>
                        {item.url &&
                          (item.url.startsWith("http://") ||
                            item.url.startsWith("https://")) && (
                            <a
                              href={item.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-slate-500 hover:text-slate-300"
                              title="Перейти до товару"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          )}
                      </div>

                      {item.notes && (
                        <p className="mt-1 line-clamp-1 text-xs text-slate-400 italic">
                          «{item.notes}»
                        </p>
                      )}
                    </div>

                    <div className="text-right">
                      <div className="text-sm font-bold text-slate-100">
                        {Number(item.estimated_price).toLocaleString("uk-UA")}{" "}
                        {item.currency}
                      </div>
                    </div>
                  </div>

                  {/* Стан: Охолодження */}
                  {isCooling && (
                    <div className="mt-3">
                      <div className="mb-1.5 flex items-center justify-between text-[11px] text-slate-400">
                        <span className="flex items-center gap-1 font-medium text-violet-400">
                          <Clock className="h-3 w-3" />
                          Залишилось: {diffDays} дн ({progressPercent}%)
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleResolve(item.id, "extend", 7)}
                            className="text-[10px] text-slate-400 underline hover:text-violet-300"
                          >
                            +7 днів
                          </button>
                          <button
                            onClick={() => handleDelete(item.id)}
                            className="text-slate-500 hover:text-rose-400"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-violet-600 to-indigo-400 transition-all duration-500"
                          style={{ width: `${progressPercent}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Стан: Готово до рішення */}
                  {isReady && (
                    <div className="mt-3 border-t border-amber-500/20 pt-2">
                      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-amber-300">
                        <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                        Охолодження завершено! Бажання все ще актуальне?
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          onClick={() =>
                            handleResolve(item.id, "saved", undefined, item)
                          }
                          className="flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-600/20 px-2.5 py-1 text-xs font-semibold text-emerald-300 transition-all hover:bg-emerald-600/30 active:scale-95"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Передумав! Врятувати кошти
                        </button>
                        <button
                          onClick={() =>
                            handleResolve(item.id, "purchased", undefined, item)
                          }
                          className="flex items-center gap-1 rounded-lg bg-violet-600 px-2.5 py-1 text-xs font-semibold text-white shadow-md shadow-violet-600/20 transition-all hover:bg-violet-500 active:scale-95"
                        >
                          <ShoppingBag className="h-3.5 w-3.5" />
                          Свідомо купити
                        </button>
                        <button
                          onClick={() => handleResolve(item.id, "extend", 7)}
                          className="ml-auto text-[10px] text-slate-400 underline hover:text-slate-200"
                        >
                          +7 дн подумати
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Стан: Врятовано */}
                  {isSaved && (
                    <div className="mt-2 flex items-center justify-between text-[11px] text-emerald-400">
                      <span className="flex items-center gap-1 font-medium">
                        <ShieldCheck className="h-3.5 w-3.5" />
                        Врятовано від покупки
                      </span>
                      <button
                        onClick={() => handleDelete(item.id)}
                        className="text-slate-500 hover:text-rose-400"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  )}

                  {/* Стан: Куплено */}
                  {isPurchased && (
                    <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
                      <span className="flex items-center gap-1">
                        <ShoppingBag className="h-3.5 w-3.5 text-indigo-400" />
                        Придбано усвідомлено
                      </span>
                      <button
                        onClick={() => handleDelete(item.id)}
                        className="text-slate-500 hover:text-rose-400"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Модальне вікно додавання нового бажання */}
      {isAddModalOpen &&
        mounted &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 p-0 backdrop-blur-sm sm:items-center sm:p-4">
            <div
              className="fixed inset-0"
              onClick={() => setIsAddModalOpen(false)}
              aria-hidden="true"
            />

            <div className="relative z-10 flex max-h-[90dvh] w-full max-w-md flex-col overscroll-contain rounded-t-[28px] border border-slate-800 bg-slate-900 shadow-2xl duration-200 sm:max-h-[85vh] sm:rounded-2xl">
              {/* Mobile handle indicator */}
              <div className="mx-auto mt-3 h-1.5 w-11 shrink-0 rounded-full bg-slate-700/50 sm:hidden" />

              <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3.5 sm:px-6 sm:py-4">
                <h3 className="flex items-center gap-2 text-base font-semibold text-slate-100">
                  <Clock className="h-5 w-5 text-violet-400" />
                  Нове бажання на охолодження
                </h3>
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form
                onSubmit={handleCreateWish}
                className="flex min-h-0 flex-1 flex-col overflow-hidden"
              >
                <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4 sm:px-6">
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
                      className="w-full rounded-xl border border-slate-700/60 bg-slate-800/50 px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 focus:outline-none"
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
                        className="w-full rounded-xl border border-slate-700/60 bg-slate-800/50 px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-300">
                        Валюта
                      </label>
                      <select
                        value={currency}
                        onChange={(e) => setCurrency(e.target.value)}
                        className="w-full rounded-xl border border-slate-700/60 bg-slate-800/50 px-3 py-2.5 text-sm text-slate-100 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 focus:outline-none"
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
                      className="w-full rounded-xl border border-slate-700/60 bg-slate-800/50 px-3.5 py-2.5 text-sm text-slate-100 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 focus:outline-none"
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
                      className="w-full rounded-xl border border-slate-700/60 bg-slate-800/50 px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 focus:outline-none"
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
                      className="w-full rounded-xl border border-slate-700/60 bg-slate-800/50 px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 border-t border-slate-800 px-5 py-3.5 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:px-6 sm:py-4 sm:pb-4">
                  <button
                    type="button"
                    onClick={() => setIsAddModalOpen(false)}
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
        )}
    </div>
  );
}
