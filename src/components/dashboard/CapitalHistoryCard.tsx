"use client";

import { useState, useMemo, useRef } from "react";
import { Search, PiggyBank, ChevronDown, ChevronUp } from "lucide-react";
import { triggerHaptic } from "@/lib/haptics";
import {
  CapitalHistoryCardProps,
  INITIAL_VISIBLE,
  CapitalHistoryHeader,
  CapitalHistoryItemRow,
} from "./capital-history";

export function CapitalHistoryCard({
  transactions,
  onSelectTransaction,
  onAddCapital,
  onImportInzhur,
}: CapitalHistoryCardProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [isExpanded, setIsExpanded] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return transactions;
    return transactions.filter(
      (tx) =>
        tx.merchant_raw.toLowerCase().includes(q) ||
        tx.category_name?.toLowerCase().includes(q) ||
        tx.tags?.some((t) => t.toLowerCase().includes(q)) ||
        String(tx.amount).includes(q)
    );
  }, [transactions, searchQuery]);

  const totalCapitalMoved = useMemo(() => {
    return transactions.reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
  }, [transactions]);

  // При активному пошуку — показуємо всі збіги
  const isSearchActive = searchQuery.trim().length > 0;
  const visibleItems =
    isSearchActive || isExpanded
      ? filtered
      : filtered.slice(0, INITIAL_VISIBLE);
  const hiddenCount = isSearchActive
    ? 0
    : Math.max(filtered.length - INITIAL_VISIBLE, 0);

  const handleToggleExpand = () => {
    triggerHaptic("selection");
    if (isExpanded) {
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTo({ top: 0, behavior: "smooth" });
      }
      setIsExpanded(false);
    } else {
      setIsExpanded(true);
    }
  };

  return (
    <div className="rounded-2xl border border-zinc-900 bg-zinc-950 p-5 shadow-sm">
      {/* Шапка картки */}
      <CapitalHistoryHeader
        transactionCount={transactions.length}
        totalCapitalMoved={totalCapitalMoved}
        onImportInzhur={onImportInzhur}
        onAddCapital={onAddCapital}
      />

      {/* Пошуковий рядок (якщо є транзакції) */}
      {transactions.length > 0 && (
        <div className="relative mb-3">
          <Search
            size={13}
            className="absolute top-1/2 left-3 -translate-y-1/2 text-zinc-500"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Пошук активу (Inzhur REIT, ОВДП), операції чи суми..."
            className="w-full rounded-xl border border-zinc-800/80 bg-zinc-900/50 py-1.5 pr-3 pl-8 text-xs text-zinc-200 placeholder-zinc-500 transition-all outline-none focus:border-emerald-500/50 focus:bg-zinc-900"
          />
        </div>
      )}

      {/* Список транзакцій */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-800/80 bg-zinc-900/20 px-4 py-8 text-center">
          <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-zinc-800 text-zinc-400">
            <PiggyBank size={16} />
          </div>
          <p className="text-xs font-semibold text-zinc-300">
            {transactions.length === 0
              ? "Ще немає зафіксованих операцій капіталу"
              : "За цим запитом нічого не знайдено"}
          </p>
          <p className="mt-1 max-w-sm text-[11px] text-zinc-500">
            {transactions.length === 0
              ? "Тут зберігаються купівлі ОВДП, Inzhur REIT, криптовалют, дивіденди та скарбнички, не змішуючись із щоденними витратами."
              : "Спробуйте змінити пошуковий запит."}
          </p>
        </div>
      ) : (
        <>
          {/* Скролюючий контейнер */}
          <div
            ref={scrollContainerRef}
            className={`pr-1.5 transition-[max-height] duration-300 ease-out ${
              isExpanded ||
              (isSearchActive && filtered.length > INITIAL_VISIBLE)
                ? "max-h-[520px] [scrollbar-width:thin] [scrollbar-color:theme(colors.zinc.700)_transparent] overflow-y-auto overscroll-contain [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-zinc-800 hover:[&::-webkit-scrollbar-thumb]:bg-zinc-700 [&::-webkit-scrollbar-track]:bg-transparent"
                : ""
            }`}
          >
            <div className="space-y-2">
              {visibleItems.map((tx) => (
                <CapitalHistoryItemRow
                  key={tx.id}
                  tx={tx}
                  onSelect={onSelectTransaction}
                />
              ))}
            </div>
          </div>

          {/* Кнопка розгортання / згортання */}
          {!isSearchActive && hiddenCount > 0 && (
            <button
              type="button"
              onClick={handleToggleExpand}
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-zinc-800/80 bg-zinc-900/30 py-2.5 text-[11px] font-medium text-zinc-400 transition-all hover:border-zinc-700 hover:bg-zinc-900/60 hover:text-zinc-200 active:scale-[0.99]"
            >
              {isExpanded ? (
                <>
                  <ChevronUp size={13} />
                  Згорнути список
                </>
              ) : (
                <>
                  <ChevronDown size={13} />
                  Показати ще {hiddenCount} операцій
                </>
              )}
            </button>
          )}

          {/* Лічильник результатів пошуку */}
          {isSearchActive && filtered.length > 0 && (
            <p className="mt-2 text-center text-[10px] text-zinc-600">
              Знайдено {filtered.length}{" "}
              {filtered.length === 1 ? "операцію" : "операцій"}
            </p>
          )}
        </>
      )}
    </div>
  );
}
