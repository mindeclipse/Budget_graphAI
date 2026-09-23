"use client";

import { useState, memo } from "react";
import { Clock, Plus } from "lucide-react";
import { WishlistItem } from "@/types/finance";
import { WishlistCardProps, WishlistFilterType } from "./wishlist/types";
import { WishlistSavedBanner } from "./wishlist/WishlistSavedBanner";
import { WishlistItemRow } from "./wishlist/WishlistItemRow";
import { AddWishlistModal } from "./modals/AddWishlistModal";

export type { WishlistCardProps };

export const WishlistCard = memo(function WishlistCard({
  items,
  savedAmount = 0,
  savingsGoals = [],
  onRefresh,
  onConvertToCostPerUse,
  onAddOptimistic,
  onResolveOptimistic,
  onDeleteOptimistic,
}: WishlistCardProps) {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [filter, setFilter] = useState<WishlistFilterType>("all");

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

  const handleResolve = async (
    id: number,
    action: "saved" | "purchased" | "extend",
    extendDays = 7,
    item?: WishlistItem
  ) => {
    if (action === "saved" || action === "purchased") {
      onResolveOptimistic?.(id, action);
    }
    if (action === "purchased" && item && onConvertToCostPerUse) {
      onConvertToCostPerUse(item);
    }
    try {
      const res = await fetch("/api/wishlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action, extend_days: extendDays }),
      });
      if (!res.ok) throw new Error("Помилка оновлення статусу");
      await onRefresh();
    } catch (err) {
      console.error(err);
      await onRefresh();
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Ви дійсно хочете видалити це бажання?")) return;
    onDeleteOptimistic?.(id);
    try {
      const res = await fetch(`/api/wishlist?id=${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Помилка видалення");
      await onRefresh();
    } catch (err) {
      console.error(err);
      await onRefresh();
    }
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
        <WishlistSavedBanner
          totalSaved={totalSaved}
          coolingCount={coolingItems.length}
          readyCount={readyItems.length}
        />

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
            filteredItems.map((item) => (
              <WishlistItemRow
                key={item.id}
                item={item}
                onResolve={handleResolve}
                onDelete={handleDelete}
                onRefresh={onRefresh}
              />
            ))
          )}
        </div>
      </div>

      {/* Модальне вікно додавання нового бажання */}
      <AddWishlistModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSuccess={onRefresh}
        onAddOptimistic={onAddOptimistic}
        savingsGoals={savingsGoals}
      />
    </div>
  );
});
