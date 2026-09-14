"use client";

import { useState, useMemo, useRef } from "react";
import {
  Landmark,
  Plus,
  Search,
  PiggyBank,
  TrendingUp,
  FileSpreadsheet,
  Building2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Transaction } from "@/types/finance";
import { triggerHaptic } from "@/lib/haptics";

// Кількість записів за замовчуванням (компактний перегляд, ~360px)
const INITIAL_VISIBLE = 6;

interface CapitalHistoryCardProps {
  transactions: Transaction[];
  onSelectTransaction: (tx: Transaction) => void;
  onAddCapital?: () => void;
  onImportInzhur?: () => void;
}

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
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-zinc-900 pb-4">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-emerald-400">
            <Landmark size={15} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-semibold tracking-wider text-zinc-300 uppercase">
                Історія операцій капіталу
              </h2>
              <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-medium text-zinc-400">
                {transactions.length}
              </span>
            </div>
            <p className="text-[11px] text-zinc-500">
              Поповнення скарбничок, інвестиції Inzhur/ОВДП та рух капіталу
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-[10px] text-zinc-500">Загальний рух</p>
            <p className="text-xs font-bold text-emerald-400">
              {totalCapitalMoved.toLocaleString("uk-UA")} ₴
            </p>
          </div>

          <div className="flex items-center gap-1.5">
            {onImportInzhur && (
              <button
                onClick={onImportInzhur}
                className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-400 transition-all hover:bg-emerald-500/20 hover:text-emerald-300 active:scale-95"
                title="Завантажити виписку або квитанцію (.xlsx, .pdf)"
              >
                <FileSpreadsheet size={13} />
                <span>Імпорт</span>
              </button>
            )}

            {onAddCapital && (
              <button
                onClick={onAddCapital}
                className="flex items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-xs font-medium text-zinc-300 transition-all hover:border-zinc-700 hover:bg-zinc-800 hover:text-white"
              >
                <Plus size={13} /> Додати
              </button>
            )}
          </div>
        </div>
      </div>

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
          {/* Скролюючий контейнер — при розгортанні плавно розширюється без стрибків */}
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
              {visibleItems.map((tx) => {
                const isDeposit =
                  tx.category_name?.toLowerCase().includes("заощадж") ||
                  tx.merchant_raw?.toLowerCase().includes("скарбнич") ||
                  tx.tags?.includes("дебет") ||
                  tx.merchant_raw?.toLowerCase().includes("нарахування") ||
                  tx.merchant_raw?.toLowerCase().includes("поповнення");

                const isCredit =
                  tx.tags?.includes("кредит") ||
                  tx.merchant_raw?.toLowerCase().includes("купівля") ||
                  tx.merchant_raw?.toLowerCase().includes("сплата");

                const isReit =
                  tx.tags?.includes("reit") ||
                  tx.merchant_raw?.toLowerCase().includes("reit");

                const isBonds =
                  tx.tags?.includes("овдп") ||
                  tx.merchant_raw?.toLowerCase().includes("овдп");

                const isInzhur = tx.source === "inzhur_statement";

                const dateStr = new Date(tx.created_at).toLocaleDateString(
                  "uk-UA",
                  {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  }
                );

                return (
                  <div
                    key={tx.id}
                    onClick={() => onSelectTransaction(tx)}
                    className="group flex cursor-pointer items-center justify-between rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-2.5 transition-all hover:border-zinc-700 hover:bg-zinc-900/80"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3 pr-2">
                      <div
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${
                          isReit
                            ? "border-teal-500/20 bg-teal-500/10 text-teal-400"
                            : isBonds
                              ? "border-indigo-500/20 bg-indigo-500/10 text-indigo-400"
                              : isDeposit
                                ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                                : "border-violet-500/20 bg-violet-500/10 text-violet-400"
                        }`}
                      >
                        {isReit ? (
                          <Building2 size={15} />
                        ) : isDeposit ? (
                          <PiggyBank size={15} />
                        ) : (
                          <TrendingUp size={15} />
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="truncate text-xs font-semibold text-zinc-200 group-hover:text-white">
                            {tx.merchant_raw}
                          </p>
                          {isInzhur && (
                            <span className="shrink-0 rounded border border-emerald-500/20 bg-emerald-500/10 px-1 py-0.5 text-[8px] font-bold text-emerald-400">
                              Inzhur
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 text-[11px] text-zinc-500">
                          <span>{dateStr}</span>
                          <span>•</span>
                          <span
                            className={
                              isReit
                                ? "text-teal-400/90"
                                : isBonds
                                  ? "text-indigo-400/90"
                                  : isDeposit
                                    ? "text-emerald-400/90"
                                    : "text-violet-400/90"
                            }
                          >
                            {tx.category_name || "Капітал"}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0 text-right whitespace-nowrap">
                      <span
                        className={`text-xs font-bold whitespace-nowrap tabular-nums ${
                          isCredit ? "text-zinc-200" : "text-emerald-400"
                        }`}
                      >
                        {isCredit ? "−" : "+"}
                        {Number(tx.amount).toLocaleString("uk-UA")}&nbsp;
                        {tx.currency === "USD" ? "$" : "₴"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Кнопка розгортання / згортання (лише коли є прихований залишок і пошук неактивний) */}
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
