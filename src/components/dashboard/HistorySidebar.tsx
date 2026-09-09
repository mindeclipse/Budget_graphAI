"use client";

import { useMemo } from "react";
import { BarChart3, Filter, X, Plus } from "lucide-react";
import { Transaction } from "@/types/finance";

interface HistorySidebarProps {
  displayedTransactions: Transaction[];
  totalPeriodTransactions: Transaction[];
  searchQuery: string;
  onSearchChange: (val: string) => void;
  activeTag: string | null;
  onTagChange: (tag: string | null) => void;
  periodLabel: string;
  onOpenCreateExpense: () => void;
}

export function HistorySidebar({
  displayedTransactions,
  totalPeriodTransactions,
  searchQuery,
  onSearchChange,
  activeTag,
  onTagChange,
  periodLabel,
  onOpenCreateExpense,
}: HistorySidebarProps) {
  // 1. Розрахунок аналітики для поточної вибірки
  const stats = useMemo(() => {
    let expenseSum = 0;
    let maxExpense = 0;
    let maxExpenseMerchant = "";
    let expenseCount = 0;

    displayedTransactions.forEach((tx) => {
      if (tx.type === "income") return;
      const amt = Number(tx.amount) || 0;
      expenseSum += amt;
      expenseCount++;
      if (amt > maxExpense) {
        maxExpense = amt;
        maxExpenseMerchant = tx.merchant_raw || tx.category_name;
      }
    });

    const avgExpense =
      expenseCount > 0 ? Math.round(expenseSum / expenseCount) : 0;

    return {
      expenseSum,
      expenseCount,
      avgExpense,
      maxExpense,
      maxExpenseMerchant,
    };
  }, [displayedTransactions]);

  // 2. Агрегація топ-категорій за період для швидкої фільтрації
  const topCategories = useMemo(() => {
    const map: Record<string, { count: number; sum: number }> = {};
    totalPeriodTransactions.forEach((tx) => {
      if (tx.type === "income") return;
      const cat = tx.category_name || "Інше";
      if (!map[cat]) map[cat] = { count: 0, sum: 0 };
      map[cat].count++;
      map[cat].sum += Number(tx.amount) || 0;
    });

    return Object.entries(map)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.sum - a.sum)
      .slice(0, 6);
  }, [totalPeriodTransactions]);

  const hasActiveFilters = Boolean(searchQuery.trim() || activeTag);

  const handleCategoryClick = (categoryName: string) => {
    if (
      searchQuery.toLowerCase().trim() === categoryName.toLowerCase().trim()
    ) {
      onSearchChange("");
    } else {
      onSearchChange(categoryName);
    }
  };

  const handleResetFilters = () => {
    onSearchChange("");
    onTagChange(null);
  };

  return (
    <div className="space-y-4">
      {/* 1. Блок аналітики вибірки */}
      <div className="rounded-2xl border border-zinc-900 bg-zinc-950 p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between border-b border-zinc-900 pb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-violet-500/20 bg-violet-500/10 text-violet-400">
              <BarChart3 size={15} />
            </div>
            <div>
              <h2 className="text-xs font-semibold tracking-wider text-zinc-300 uppercase">
                Підсумок вибірки
              </h2>
              <p className="text-[10px] text-zinc-500">{periodLabel}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onOpenCreateExpense}
            className="flex items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-xs text-zinc-300 transition-all hover:border-zinc-700 hover:bg-zinc-800 hover:text-white"
          >
            <Plus size={13} /> Додати
          </button>
        </div>

        {/* Метрики */}
        <div className="grid grid-cols-2 gap-2.5">
          <div className="rounded-xl border border-zinc-900 bg-zinc-900/30 p-3">
            <p className="text-[10px] font-medium tracking-wider text-zinc-500 uppercase">
              Сума витрат
            </p>
            <p className="mt-1 text-base font-bold text-white">
              {stats.expenseSum.toLocaleString("uk-UA")} ₴
            </p>
            <p className="mt-0.5 text-[10px] text-zinc-500">
              {displayedTransactions.length} операцій
            </p>
          </div>

          <div className="rounded-xl border border-zinc-900 bg-zinc-900/30 p-3">
            <p className="text-[10px] font-medium tracking-wider text-zinc-500 uppercase">
              Середній чек
            </p>
            <p className="mt-1 text-base font-bold text-emerald-400">
              {stats.avgExpense.toLocaleString("uk-UA")} ₴
            </p>
            <p className="mt-0.5 text-[10px] text-zinc-500">на транзакцію</p>
          </div>

          {stats.maxExpense > 0 && (
            <div className="col-span-2 rounded-xl border border-zinc-900 bg-zinc-900/30 p-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-medium tracking-wider text-zinc-500 uppercase">
                  Найбільша операція
                </span>
                <span className="font-mono text-xs font-bold text-violet-300">
                  {stats.maxExpense.toLocaleString("uk-UA")} ₴
                </span>
              </div>
              <p className="mt-1 truncate text-xs font-medium text-zinc-300">
                {stats.maxExpenseMerchant}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* 2. Швидкий фільтр за категоріями */}
      {topCategories.length > 0 && (
        <div className="rounded-2xl border border-zinc-900 bg-zinc-950 p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-zinc-400 uppercase">
              <Filter size={13} className="text-zinc-500" /> Швидкий фільтр
            </div>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="flex items-center gap-1 text-[11px] text-violet-400 transition-colors hover:text-violet-300"
              >
                <X size={12} /> Скинути
              </button>
            )}
          </div>

          <div className="space-y-1.5">
            {topCategories.map((cat) => {
              const isSelected =
                searchQuery.toLowerCase().trim() ===
                cat.name.toLowerCase().trim();

              return (
                <button
                  key={cat.name}
                  type="button"
                  onClick={() => handleCategoryClick(cat.name)}
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs transition-all ${
                    isSelected
                      ? "border border-violet-500/40 bg-violet-500/10 text-white"
                      : "border border-zinc-900 bg-zinc-900/40 text-zinc-300 hover:border-zinc-800 hover:bg-zinc-900 hover:text-white"
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${
                        isSelected ? "bg-violet-400" : "bg-zinc-600"
                      }`}
                    />
                    <span className="truncate font-medium">{cat.name}</span>
                  </div>

                  <div className="flex shrink-0 items-center gap-2 font-mono text-[11px] text-zinc-500">
                    <span>{cat.sum.toLocaleString("uk-UA")} ₴</span>
                    <span className="rounded bg-zinc-800 px-1 text-[10px] text-zinc-400">
                      {cat.count}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
