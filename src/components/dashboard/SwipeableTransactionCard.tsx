"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Trash2, SlidersHorizontal, Split, HelpCircle } from "lucide-react";
import { Transaction } from "@/types/finance";
import { CATEGORY_ICONS, CATEGORY_COLORS } from "@/constants/categories";
import { triggerHaptic } from "@/lib/haptics";

const SWIPE_THRESHOLD = 75;
const MAX_RUBBER_BAND = 130;

export interface SwipeableTransactionCardProps {
  transaction: Transaction;
  isSyncing?: boolean;
  onSelect: (tx: Transaction) => void;
  onDelete?: (txId: number) => void;
  onSplit?: (tx: Transaction) => void;
  onOpenTagProject?: (tag: string) => void;
}

export function SwipeableTransactionCard({
  transaction,
  isSyncing = false,
  onSelect,
  onDelete,
  onSplit,
  onOpenTagProject,
}: SwipeableTransactionCardProps) {
  const [offsetX, setOffsetX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [hasCrossedThreshold, setHasCrossedThreshold] = useState(false);

  // Відстеження жестів touch
  const touchStartXRef = useRef(0);
  const touchStartYRef = useRef(0);
  const isHorizontalSwipeRef = useRef<boolean | null>(null);
  const currentOffsetRef = useRef(0);
  const hasTriggeredHapticRef = useRef(false);

  const IconComponent = CATEGORY_ICONS[transaction.category_name] || HelpCircle;
  const iconColor = CATEGORY_COLORS[transaction.category_name] || "#71717A";

  const isIncome = transaction.type === "income";
  const hasSplitItems =
    Array.isArray(transaction.metadata?.receipt_items) &&
    transaction.metadata.receipt_items.length > 1;

  const isEmergency =
    Boolean(transaction.exclude_from_budget) &&
    (Boolean(transaction.metadata?.is_emergency) ||
      Boolean(transaction.tags?.includes("форсмажор")));

  const amort = transaction.metadata?.amortization;
  const isAmortized =
    !isEmergency &&
    Boolean(amort && typeof amort === "object" && Number(amort.months) > 1);

  const amortMonths = isAmortized ? Number(amort.months) : 1;
  const amortMonthly = isAmortized
    ? Number(amort.monthly_amount) ||
      Math.round(Number(transaction.amount) / amortMonths)
    : Number(transaction.amount);

  // Очищення стану виходу при зміні транзакції
  useEffect(() => {
    setIsExiting(false);
    setOffsetX(0);
    currentOffsetRef.current = 0;
  }, [transaction.id]);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (isSyncing || isExiting) return;
    const touch = e.touches[0];
    touchStartXRef.current = touch.clientX;
    touchStartYRef.current = touch.clientY;
    isHorizontalSwipeRef.current = null;
    hasTriggeredHapticRef.current = false;
    setIsDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (isSyncing || isExiting || !isDragging) return;
    const touch = e.touches[0];
    const diffX = touch.clientX - touchStartXRef.current;
    const diffY = touch.clientY - touchStartYRef.current;

    // Визначаємо намір користувача: вертикальний скрол чи горизонтальний свайп
    if (isHorizontalSwipeRef.current === null) {
      if (Math.abs(diffX) > 8 || Math.abs(diffY) > 8) {
        if (Math.abs(diffX) > Math.abs(diffY)) {
          isHorizontalSwipeRef.current = true;
        } else {
          // Користувач скролить вертикально — не блокуємо нативний скрол
          isHorizontalSwipeRef.current = false;
          setIsDragging(false);
          setOffsetX(0);
          return;
        }
      } else {
        return;
      }
    }

    if (!isHorizontalSwipeRef.current) return;

    // Розрахунок зміщення з еластичним супротивом (Rubber-banding)
    const sign = Math.sign(diffX);
    const absDiff = Math.abs(diffX);
    let dampedX = diffX;

    if (absDiff > SWIPE_THRESHOLD) {
      const excess = absDiff - SWIPE_THRESHOLD;
      const damped = Math.pow(excess, 0.72) * 2;
      dampedX = sign * Math.min(SWIPE_THRESHOLD + damped, MAX_RUBBER_BAND);
    }

    setOffsetX(dampedX);
    currentOffsetRef.current = dampedX;

    // Тактильний відгук Taptic Engine при перетині порогу дії
    const isPast = absDiff >= SWIPE_THRESHOLD;
    if (isPast && !hasTriggeredHapticRef.current) {
      hasTriggeredHapticRef.current = true;
      setHasCrossedThreshold(true);
      triggerHaptic("selection");
    } else if (!isPast && hasTriggeredHapticRef.current) {
      hasTriggeredHapticRef.current = false;
      setHasCrossedThreshold(false);
    }
  };

  const handleTouchEnd = () => {
    if (isSyncing || isExiting || !isDragging) return;
    setIsDragging(false);

    const finalOffset = currentOffsetRef.current;
    const isPast = Math.abs(finalOffset) >= SWIPE_THRESHOLD;

    if (isPast) {
      if (finalOffset < 0 && onDelete) {
        // Свайп вліво: видалення в кошик
        triggerHaptic("medium");
        setIsExiting(true);
        setOffsetX(-window.innerWidth);
        setTimeout(() => {
          onDelete(transaction.id);
        }, 220);
        return;
      } else if (finalOffset > 0) {
        // Свайп вправо: редагування або швидкий спліт
        triggerHaptic("light");
        setOffsetX(0);
        currentOffsetRef.current = 0;
        setHasCrossedThreshold(false);

        if (hasSplitItems && onSplit) {
          onSplit(transaction);
        } else {
          onSelect(transaction);
        }
        return;
      }
    }

    // Повернення на місце (Snap back)
    setOffsetX(0);
    currentOffsetRef.current = 0;
    setHasCrossedThreshold(false);
  };

  const handleClick = () => {
    if (isSyncing || isExiting) return;
    // Викликаємо перегляд тільки якщо це був клік, а не свайп
    if (Math.abs(offsetX) < 6) {
      onSelect(transaction);
    }
  };

  return (
    <div
      className={`relative overflow-hidden rounded-xl transition-[max-height,opacity,margin,padding] duration-250 ease-out ${
        isExiting
          ? "pointer-events-none my-0 max-h-0 py-0 opacity-0"
          : "my-1 max-h-32"
      }`}
    >
      {/* Підкладка дій: Свайп вправо (Редагувати / Split) */}
      <div
        className={`absolute inset-y-0 left-0 flex items-center justify-start rounded-xl px-4 text-xs font-semibold transition-colors duration-150 ${
          offsetX > 0
            ? hasCrossedThreshold
              ? "bg-sky-500 text-white"
              : "bg-sky-600/60 text-sky-200"
            : "pointer-events-none opacity-0"
        }`}
        style={{ width: "100%" }}
      >
        <div
          className={`flex items-center gap-1.5 transition-transform duration-150 ${
            hasCrossedThreshold ? "translate-x-1 scale-110" : "scale-100"
          }`}
        >
          {hasSplitItems ? (
            <Split size={18} />
          ) : (
            <SlidersHorizontal size={18} />
          )}
          <span>{hasSplitItems ? "Split" : "Дії"}</span>
        </div>
      </div>

      {/* Підкладка дій: Свайп вліво (Кошик / Видалити) */}
      <div
        className={`absolute inset-y-0 right-0 flex items-center justify-end rounded-xl px-4 text-xs font-semibold transition-colors duration-150 ${
          offsetX < 0
            ? hasCrossedThreshold
              ? "bg-rose-500 text-white"
              : "bg-rose-600/60 text-rose-200"
            : "pointer-events-none opacity-0"
        }`}
        style={{ width: "100%" }}
      >
        <div
          className={`flex items-center gap-1.5 transition-transform duration-150 ${
            hasCrossedThreshold ? "-translate-x-1 scale-110" : "scale-100"
          }`}
        >
          <span>В кошик</span>
          <Trash2 size={18} />
        </div>
      </div>

      {/* Основна картка транзакції */}
      <div
        onClick={handleClick}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        style={{
          transform: `translateX(${offsetX}px)`,
          transition: isDragging
            ? "none"
            : "transform 260ms cubic-bezier(0.175, 0.885, 0.32, 1.15)",
        }}
        className={`group relative flex touch-pan-y items-center justify-between rounded-xl border border-zinc-800/60 bg-zinc-900/90 p-3 backdrop-blur-sm transition-colors duration-150 select-none ${
          isSyncing
            ? "pointer-events-none opacity-50 select-none"
            : "cursor-pointer hover:border-zinc-700/80 hover:bg-zinc-900 active:bg-zinc-800/80"
        }`}
      >
        <div className="flex min-w-0 items-center space-x-3 pr-2">
          <div
            className="shrink-0 rounded-lg p-2 transition-transform duration-150 group-hover:scale-110"
            style={{
              backgroundColor: `${iconColor}15`,
              color: iconColor,
            }}
          >
            <IconComponent size={16} />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-zinc-100 transition-colors group-hover:text-white">
              {transaction.merchant_raw}
            </p>
            <p className="truncate text-xs text-zinc-500">
              {transaction.category_name} •{" "}
              {new Date(transaction.created_at).toLocaleDateString([], {
                day: "numeric",
                month: "short",
              })}{" "}
              {new Date(transaction.created_at).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
            {/* Спеціальні бейджі: Покриття з подушки та Амортизація */}
            <div className="mt-1 flex flex-wrap items-center gap-1">
              {isEmergency && (
                <span className="inline-flex items-center rounded-md border border-amber-500/30 bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300">
                  🛡️ З подушки
                </span>
              )}
              {isAmortized && (
                <span className="inline-flex items-center rounded-md border border-indigo-500/30 bg-indigo-500/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-indigo-300">
                  🗓️ {amortMonths} міс (по{" "}
                  {amortMonthly.toLocaleString("uk-UA")} ₴)
                </span>
              )}
              {transaction.tags &&
                transaction.tags.length > 0 &&
                transaction.tags
                  .filter((t) => t !== "форсмажор")
                  .map((tag: string) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenTagProject?.(tag);
                      }}
                      title={`Аналітика проєкту #${tag} за всі періоди`}
                      className="rounded bg-zinc-800/90 px-1.5 py-0.5 text-[10px] font-medium text-zinc-400 transition-colors hover:bg-sky-500/20 hover:text-sky-300"
                    >
                      #{tag}
                    </button>
                  ))}
            </div>
          </div>
        </div>

        <div className="ml-2 flex flex-col items-end">
          <span
            className={`font-mono text-sm font-bold tracking-tight whitespace-nowrap tabular-nums ${
              isEmergency
                ? "text-zinc-400 line-through opacity-80"
                : isIncome
                  ? "text-emerald-400"
                  : "text-white"
            }`}
          >
            {isIncome ? "+" : "-"}
            {Number(transaction.amount).toFixed(2)} ₴
          </span>
          {isEmergency && (
            <span className="text-[10px] font-medium text-amber-400">
              з подушки
            </span>
          )}
          {isAmortized && (
            <span className="font-mono text-[10px] text-indigo-400 tabular-nums">
              {amortMonthly.toFixed(2)} ₴/міс
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
