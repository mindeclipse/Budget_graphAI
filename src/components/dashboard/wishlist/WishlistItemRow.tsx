"use client";

import {
  Clock,
  ExternalLink,
  Trash2,
  CheckCircle2,
  ShoppingBag,
  Sparkles,
  ShieldCheck,
} from "lucide-react";
import { WishlistItem } from "@/types/finance";
import { calculateRemainingDays } from "./types";

interface WishlistItemRowProps {
  item: WishlistItem;
  onResolve: (
    id: number,
    action: "saved" | "purchased" | "extend",
    extendDays?: number,
    item?: WishlistItem
  ) => void;
  onDelete: (id: number) => void;
}

export function WishlistItemRow({
  item,
  onResolve,
  onDelete,
}: WishlistItemRowProps) {
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
                onClick={() => onResolve(item.id, "extend", 7)}
                className="text-[10px] text-slate-400 underline hover:text-violet-300"
              >
                +7 днів
              </button>
              <button
                onClick={() => onDelete(item.id)}
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
              onClick={() => onResolve(item.id, "saved", undefined, item)}
              className="flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-600/20 px-2.5 py-1 text-xs font-semibold text-emerald-300 transition-all hover:bg-emerald-600/30 active:scale-95"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Передумав! Врятувати кошти
            </button>
            <button
              onClick={() => onResolve(item.id, "purchased", undefined, item)}
              className="flex items-center gap-1 rounded-lg bg-violet-600 px-2.5 py-1 text-xs font-semibold text-white shadow-md shadow-violet-600/20 transition-all hover:bg-violet-500 active:scale-95"
            >
              <ShoppingBag className="h-3.5 w-3.5" />
              Свідомо купити
            </button>
            <button
              onClick={() => onResolve(item.id, "extend", 7)}
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
    </div>
  );
}
