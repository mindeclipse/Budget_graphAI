"use client";

import { HelpCircle } from "lucide-react";
import { Transaction } from "@/types/finance";
import { CATEGORY_ICONS, CATEGORY_COLORS } from "@/constants/categories";
import {
  useSwipeGesture,
  TransactionBadges,
  SwipeActionsBackground,
} from "./transaction-card";

export interface SwipeableTransactionCardProps {
  transaction: Transaction;
  isSyncing?: boolean;
  onSelect: (tx: Transaction) => void;
  onDelete?: (txId: number) => void;
  onSplit?: (tx: Transaction) => void;
  onOpenTagProject?: (tag: string) => void;
  className?: string;
}

export function SwipeableTransactionCard({
  transaction,
  isSyncing = false,
  onSelect,
  onDelete,
  onOpenTagProject,
  className,
}: SwipeableTransactionCardProps) {
  const {
    offsetX,
    isDragging,
    isExiting,
    hasCrossedThreshold,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    handleClick,
  } = useSwipeGesture({
    transactionId: transaction.id,
    isSyncing,
    onDelete,
    onSelect: () => onSelect(transaction),
  });

  const IconComponent = CATEGORY_ICONS[transaction.category_name] || HelpCircle;
  const iconColor = CATEGORY_COLORS[transaction.category_name] || "#71717A";

  const isIncome = transaction.type === "income";
  const hasSplitItems =
    Array.isArray(transaction.metadata?.receipt_items) &&
    transaction.metadata.receipt_items.length > 1;

  const isEmergency =
    Boolean(transaction.metadata?.is_emergency) ||
    Boolean(transaction.tags?.includes("форсмажор"));

  const amort = transaction.metadata?.amortization;
  const isAmortized =
    !isEmergency &&
    Boolean(amort && typeof amort === "object" && Number(amort.months) > 1);

  const amortMonths = isAmortized ? Number(amort.months) : 1;
  const amortMonthly = isAmortized
    ? Number(amort.monthly_amount) ||
      Math.round(Number(transaction.amount) / amortMonths)
    : Number(transaction.amount);

  const transactionComment =
    (transaction.metadata?.comment as string | undefined)?.trim() ||
    (transaction.metadata?.note as string | undefined)?.trim() ||
    null;

  return (
    <div
      className={`relative overflow-hidden rounded-2xl select-none ${className || ""}`}
    >
      {/* Фоновий шар дій при свайпі */}
      {Boolean(onDelete) && (
        <SwipeActionsBackground
          offsetX={offsetX}
          hasCrossedThreshold={hasCrossedThreshold}
        />
      )}

      {/* Основна картка (зміщується за пальцем) */}
      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={handleClick}
        style={{
          transform: `translateX(${offsetX}px)`,
          transition: isDragging
            ? "none"
            : isExiting
              ? "transform 0.2s cubic-bezier(0.4, 0, 1, 1), opacity 0.2s ease-out"
              : "transform 0.35s cubic-bezier(0.16, 1, 0.3, 1)",
          opacity: isExiting ? 0 : 1,
        }}
        className="group relative flex cursor-pointer items-center justify-between border border-zinc-800/80 bg-zinc-900/60 p-3.5 backdrop-blur-md transition-colors hover:border-zinc-700/80 hover:bg-zinc-900/90 active:bg-zinc-800/80"
      >
        <div className="flex min-w-0 flex-1 items-center gap-3.5 pr-2">
          {/* Категорійна іконка */}
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/5 shadow-inner"
            style={{ backgroundColor: `${iconColor}18`, color: iconColor }}
          >
            <IconComponent size={18} />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h4 className="truncate text-xs font-semibold text-zinc-100 group-hover:text-white sm:text-sm">
                {transaction.merchant_raw}
              </h4>
            </div>

            {/* Коментар / замітка */}
            {transactionComment && (
              <p className="mt-0.5 truncate text-[11px] text-zinc-400 italic">
                «{transactionComment}»
              </p>
            )}

            {/* Бейджі метаданих */}
            <TransactionBadges
              transaction={transaction}
              isEmergency={isEmergency}
              isAmortized={isAmortized}
              amortMonths={amortMonths}
              amortMonthly={amortMonthly}
              hasSplitItems={hasSplitItems}
              onOpenTagProject={onOpenTagProject}
            />
          </div>
        </div>

        {/* Сума та час */}
        <div className="shrink-0 text-right">
          <div
            className={`text-sm font-bold tabular-nums sm:text-base ${
              isIncome ? "text-emerald-400" : "text-white"
            }`}
          >
            {isIncome ? "+" : ""}
            {Number(transaction.amount).toLocaleString("uk-UA")}{" "}
            <span className="text-xs font-medium text-zinc-400">
              {transaction.currency === "USD" ? "$" : "₴"}
            </span>
          </div>

          <div className="text-[10px] text-zinc-500 tabular-nums">
            {new Date(transaction.created_at).toLocaleTimeString("uk-UA", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
