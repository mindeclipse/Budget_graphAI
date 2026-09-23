"use client";

import { useState } from "react";
import {
  Clock,
  ExternalLink,
  Trash2,
  CheckCircle2,
  ShoppingBag,
  Sparkles,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  Tag,
  PiggyBank,
  Edit2,
  Target,
} from "lucide-react";
import { WishlistItem } from "@/types/finance";
import { calculateRemainingDays } from "./types";
import { UpdatePriceModal } from "../modals/UpdatePriceModal";

interface WishlistItemRowProps {
  item: WishlistItem;
  onResolve: (
    id: number,
    action: "saved" | "purchased" | "extend",
    extendDays?: number,
    item?: WishlistItem
  ) => void;
  onDelete: (id: number) => void;
  onRefresh?: () => void | Promise<void>;
}

export function WishlistItemRow({
  item,
  onResolve,
  onDelete,
  onRefresh,
}: WishlistItemRowProps) {
  const [isPriceModalOpen, setIsPriceModalOpen] = useState(false);

  const isCooling = item.status === "cooling";
  const isReady = item.status === "ready";
  const isSaved = item.status === "saved";
  const isPurchased = item.status === "purchased";

  const { diffDays, progressPercent } = calculateRemainingDays(
    item.cooling_end_date,
    item.cooling_days
  );

  const initialPrice = Number(item.initial_price || item.estimated_price);
  const currentPrice = Number(item.estimated_price);
  const priceDelta = currentPrice - initialPrice;
  const priceDeltaPct =
    initialPrice > 0 ? (priceDelta / initialPrice) * 100 : 0;
  const targetPrice = item.target_price ? Number(item.target_price) : null;
  const isTargetReached = targetPrice !== null && currentPrice <= targetPrice;

  const savingsGoal = item.savings_goal;
  const goalProgress =
    savingsGoal && savingsGoal.target_amount
      ? Math.min(
          100,
          Math.round(
            (Number(savingsGoal.current_amount) /
              Number(savingsGoal.target_amount)) *
              100
          )
        )
      : null;

  return (
    <div
      className={`group relative rounded-xl border p-3.5 transition-all ${
        isReady
          ? "border-amber-500/40 bg-amber-500/5 hover:border-amber-500/60"
          : isSaved
            ? "border-emerald-500/20 bg-emerald-500/5"
            : isPurchased
              ? "border-slate-800 bg-slate-800/20 opacity-70"
              : isTargetReached
                ? "border-emerald-500/40 bg-emerald-500/5 hover:border-emerald-500/60"
                : "border-slate-800/70 bg-slate-800/30 hover:border-slate-700"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
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

          {/* Бейджі трекера ціни та цілі */}
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {/* Дельта ціни від стартової */}
            {initialPrice > 0 && Math.abs(priceDelta) > 0.01 && (
              <span
                className={`flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
                  priceDelta < 0
                    ? "bg-emerald-500/10 text-emerald-300"
                    : "bg-rose-500/10 text-rose-300"
                }`}
              >
                {priceDelta < 0 ? (
                  <TrendingDown className="h-3 w-3 text-emerald-400" />
                ) : (
                  <TrendingUp className="h-3 w-3 text-rose-400" />
                )}
                {priceDelta < 0 ? "-" : "+"}
                {Math.abs(priceDelta).toLocaleString("uk-UA")} {item.currency} (
                {Math.abs(priceDeltaPct).toFixed(1)}%)
              </span>
            )}

            {/* Статус цільової ціни */}
            {targetPrice !== null && (
              <span
                className={`flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
                  isTargetReached
                    ? "animate-pulse border border-emerald-500/30 bg-emerald-500/20 text-emerald-300"
                    : "bg-amber-500/10 text-amber-300"
                }`}
              >
                <Target className="h-3 w-3" />
                {isTargetReached
                  ? "Цільова ціна досягнута!"
                  : `Ціль: ${targetPrice.toLocaleString("uk-UA")} ${item.currency}`}
              </span>
            )}
          </div>

          {/* Індикатор накопичення у зв'язаній Скарбничці */}
          {savingsGoal && (
            <div className="mt-2 rounded-lg border border-pink-500/20 bg-pink-500/5 p-1.5">
              <div className="flex items-center justify-between text-[10px] font-medium text-pink-300">
                <span className="flex items-center gap-1">
                  <PiggyBank className="h-3 w-3 text-pink-400" />
                  Скарбничка: {savingsGoal.name}
                </span>
                <span>
                  {Number(savingsGoal.current_amount).toLocaleString("uk-UA")} /{" "}
                  {Number(savingsGoal.target_amount).toLocaleString("uk-UA")}{" "}
                  {savingsGoal.currency} ({goalProgress}%)
                </span>
              </div>
              {goalProgress !== null && (
                <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-pink-950/60">
                  <div
                    className="h-full rounded-full bg-pink-500 transition-all duration-300"
                    style={{ width: `${goalProgress}%` }}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Права колонка: ціна та кнопка оновлення */}
        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-1">
            <span className="text-sm font-bold text-slate-100">
              {currentPrice.toLocaleString("uk-UA")} {item.currency}
            </span>
            {(isCooling || isReady) && (
              <button
                type="button"
                onClick={() => setIsPriceModalOpen(true)}
                title="Оновити ціну"
                className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              >
                <Edit2 className="h-3 w-3" />
              </button>
            )}
          </div>

          {initialPrice > 0 && Math.abs(priceDelta) > 0.01 && (
            <span className="text-[10px] text-slate-500 line-through">
              {initialPrice.toLocaleString("uk-UA")} {item.currency}
            </span>
          )}
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
                onClick={() => onResolve(item.id, "extend", 7)}
                className="text-[10px] text-slate-400 underline hover:text-violet-300"
                title="Відкласти на тиждень"
              >
                +7дн
              </button>
              <button
                onClick={() => onResolve(item.id, "extend", 30)}
                className="text-[10px] text-slate-400 underline hover:text-violet-300"
                title="Відкласти на місяць"
              >
                +30дн
              </button>
              <button
                onClick={() => onDelete(item.id)}
                className="text-slate-500 hover:text-rose-400"
                title="Видалити"
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
              onClick={() => onResolve(item.id, "saved", undefined, item)}
              className="flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-600/20 px-2.5 py-1 text-xs font-semibold text-emerald-300 transition-all hover:bg-emerald-600/30 active:scale-95"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Врятувати кошти
            </button>
            <button
              onClick={() => onResolve(item.id, "purchased", undefined, item)}
              className="flex items-center gap-1 rounded-lg bg-violet-600 px-2.5 py-1 text-xs font-semibold text-white shadow-md shadow-violet-600/20 transition-all hover:bg-violet-500 active:scale-95"
            >
              <ShoppingBag className="h-3.5 w-3.5" />
              Свідомо купити
            </button>
            <button
              onClick={() => onResolve(item.id, "extend", 30)}
              className="ml-auto text-[10px] text-slate-400 underline hover:text-slate-200"
            >
              +30 дн подумати
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
            onClick={() => onDelete(item.id)}
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
            onClick={() => onDelete(item.id)}
            className="text-slate-500 hover:text-rose-400"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Модальне вікно оновлення ціни */}
      {isPriceModalOpen && (
        <UpdatePriceModal
          isOpen={isPriceModalOpen}
          onClose={() => setIsPriceModalOpen(false)}
          item={item}
          onSuccess={async () => {
            if (onRefresh) await onRefresh();
          }}
        />
      )}
    </div>
  );
}
