"use client";

import React from "react";
import { Receipt, Plus, Search, X, HelpCircle } from "lucide-react";
import { Transaction } from "@/types/finance";
import { CATEGORY_ICONS, CATEGORY_COLORS } from "@/constants/categories";

interface TransactionsListProps {
  totalMonthTransactionsCount: number;
  displayedTransactions: Transaction[];
  searchQuery: string;
  onSearchChange: (val: string) => void;
  availableTags: string[];
  activeTag: string | null;
  onTagChange: (tag: string | null) => void;
  onOpenCreateExpense: () => void;
  onSelectTransaction: (tx: Transaction) => void;
}

export function TransactionsList({
  totalMonthTransactionsCount,
  displayedTransactions,
  searchQuery,
  onSearchChange,
  availableTags,
  activeTag,
  onTagChange,
  onOpenCreateExpense,
  onSelectTransaction,
}: TransactionsListProps) {
  return (
    <div className="rounded-2xl border border-zinc-900 bg-zinc-950 p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-zinc-400 uppercase">
          <Receipt size={14} className="text-zinc-500" /> Транзакції
        </h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenCreateExpense}
            className="flex items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-xs text-zinc-300 transition-all hover:border-zinc-700 hover:bg-zinc-800 hover:text-white active:scale-95"
          >
            <Plus size={13} className="text-zinc-400" /> Додати
          </button>
          <span className="rounded-md border border-zinc-800 bg-zinc-900 px-2 py-0.5 font-mono text-[11px] text-zinc-400">
            {displayedTransactions.length} оп.
          </span>
        </div>
      </div>

      <div className="mb-4 space-y-2.5">
        <div className="relative flex items-center">
          <Search
            size={15}
            className="pointer-events-none absolute left-3.5 text-zinc-500"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Пошук за мерчантом, сумою чи категорією..."
            className="w-full rounded-2xl border border-zinc-800 bg-zinc-900/60 py-2.5 pr-9 pl-9 text-xs text-white placeholder-zinc-500 transition-all focus:border-zinc-700 focus:bg-zinc-900 focus:outline-none"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="absolute right-3 rounded-lg p-0.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {availableTags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            <span className="mr-1 text-[11px] font-medium text-zinc-500">
              Теги:
            </span>
            {availableTags.map((tag: string) => {
              const isActive = activeTag === tag;
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => onTagChange(isActive ? null : tag)}
                  className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition-all ${
                    isActive
                      ? "border border-sky-500/50 bg-sky-500/15 font-semibold text-sky-400"
                      : "border border-zinc-800 bg-zinc-900/50 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
                  }`}
                >
                  #{tag}
                </button>
              );
            })}
            {activeTag && (
              <button
                type="button"
                onClick={() => onTagChange(null)}
                className="rounded-lg px-2 py-1 text-[10px] text-zinc-500 underline underline-offset-2 hover:text-zinc-300"
              >
                Скинути
              </button>
            )}
          </div>
        )}
      </div>

      {totalMonthTransactionsCount === 0 ? (
        <div className="py-16 text-center text-zinc-600">
          <Receipt size={32} className="mx-auto mb-2 opacity-40" />
          <p className="text-sm">Транзакцій немає</p>
          <p className="mt-1 text-xs text-zinc-700">
            У цьому місяці витрат не зафіксовано
          </p>
        </div>
      ) : displayedTransactions.length === 0 ? (
        <div className="rounded-2xl border border-zinc-800/60 bg-zinc-900/30 p-8 text-center">
          <p className="text-sm font-medium text-zinc-400">
            Нічого не знайдено
          </p>
          <p className="mt-1 text-xs text-zinc-600">
            За вашим фільтром немає відповідних транзакцій
          </p>
          <button
            type="button"
            onClick={() => {
              onSearchChange("");
              onTagChange(null);
            }}
            className="mt-3 inline-flex items-center rounded-xl bg-zinc-800 px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:bg-zinc-700 hover:text-white"
          >
            Очистити пошук
          </button>
        </div>
      ) : (
        <div className="max-h-[420px] [scrollbar-width:thin] space-y-2 overflow-y-auto pr-1.5 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-zinc-800 hover:[&::-webkit-scrollbar-thumb]:bg-zinc-700 [&::-webkit-scrollbar-track]:bg-transparent">
          {displayedTransactions.map((t: Transaction) => {
            const IconComponent = CATEGORY_ICONS[t.category_name] || HelpCircle;
            const iconColor = CATEGORY_COLORS[t.category_name] || "#71717A";
            const isSyncing = t.id < 0;

            return (
              <div
                key={t.id}
                onClick={() => {
                  if (isSyncing) return;
                  onSelectTransaction(t);
                }}
                className={`group flex items-center justify-between rounded-xl border border-zinc-800/60 bg-zinc-900/40 p-3 transition-all duration-150 ${
                  isSyncing
                    ? "pointer-events-none opacity-50 select-none"
                    : "cursor-pointer hover:translate-x-0.5 hover:border-zinc-700/80 hover:bg-zinc-900/80 active:scale-[0.99]"
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
                      {t.merchant_raw}
                    </p>
                    <p className="truncate text-xs text-zinc-500">
                      {t.category_name} •{" "}
                      {new Date(t.created_at).toLocaleDateString([], {
                        day: "numeric",
                        month: "short",
                      })}{" "}
                      {new Date(t.created_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                    {t.tags && t.tags.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {t.tags.map((tag: string) => (
                          <span
                            key={tag}
                            className="rounded bg-zinc-800/90 px-1.5 py-0.5 text-[10px] font-medium text-zinc-400"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <span className="ml-2 font-mono text-sm font-bold tracking-tight whitespace-nowrap text-white tabular-nums">
                  -{Number(t.amount).toFixed(2)} ₴
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
