"use client";

import { useEffect, useMemo, useState } from "react";
import {
  X,
  FolderKanban,
  Receipt,
  Calendar,
  HelpCircle,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { Transaction } from "@/types/finance";
import { CATEGORY_ICONS, CATEGORY_COLORS } from "@/constants/categories";

export interface ProjectCategoryStat {
  name: string;
  amount: number;
  percentage: number;
}

export interface ProjectMonthStat {
  key: string;
  label: string;
  amount: number;
  count: number;
}

export interface ProjectMetricsResult {
  projectTxs: Transaction[];
  expenseTxs: Transaction[];
  incomeTxs: Transaction[];
  totalSpent: number;
  totalIncome: number;
  netBalance: number;
  txCount: number;
  firstDate: Date | null;
  lastDate: Date | null;
  categories: ProjectCategoryStat[];
  monthlyDistribution: ProjectMonthStat[];
  avgCheck: number;
}

export function calculateProjectMetrics(
  tag: string | null,
  transactions: Transaction[]
): ProjectMetricsResult {
  if (!tag) {
    return {
      projectTxs: [],
      expenseTxs: [],
      incomeTxs: [],
      totalSpent: 0,
      totalIncome: 0,
      netBalance: 0,
      txCount: 0,
      firstDate: null,
      lastDate: null,
      categories: [],
      monthlyDistribution: [],
      avgCheck: 0,
    };
  }

  const normalizedTag = tag.toLowerCase().replace(/^#/, "").trim();

  const projectTxs = transactions
    .filter((t) => {
      if (!t.tags || !Array.isArray(t.tags)) return false;
      return t.tags.some(
        (txTag) =>
          typeof txTag === "string" &&
          txTag.toLowerCase().replace(/^#/, "").trim() === normalizedTag
      );
    })
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

  const expenseTxs = projectTxs.filter(
    (t) => (t.type === "expense" || !t.type) && !t.exclude_from_budget
  );
  const incomeTxs = projectTxs.filter((t) => t.type === "income");

  const totalSpent = expenseTxs.reduce(
    (sum, t) => sum + Number(t.amount || 0),
    0
  );
  const totalIncome = incomeTxs.reduce(
    (sum, t) => sum + Number(t.amount || 0),
    0
  );
  const netBalance = totalIncome - totalSpent;

  let firstDate: Date | null = null;
  let lastDate: Date | null = null;
  if (projectTxs.length > 0) {
    const timestamps = projectTxs.map((t) => new Date(t.created_at).getTime());
    firstDate = new Date(Math.min(...timestamps));
    lastDate = new Date(Math.max(...timestamps));
  }

  const categoryMap: Record<string, number> = {};
  expenseTxs.forEach((t) => {
    const cat = t.category_name || "Інше";
    categoryMap[cat] = (categoryMap[cat] || 0) + Number(t.amount || 0);
  });

  const categories: ProjectCategoryStat[] = Object.entries(categoryMap)
    .map(([name, amount]) => ({
      name,
      amount,
      percentage: totalSpent > 0 ? (amount / totalSpent) * 100 : 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  const monthMap: Record<
    string,
    { label: string; amount: number; count: number }
  > = {};
  expenseTxs.forEach((t) => {
    const d = new Date(t.created_at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("uk-UA", {
      month: "short",
      year: "numeric",
    });
    if (!monthMap[key]) {
      monthMap[key] = { label, amount: 0, count: 0 };
    }
    monthMap[key].amount += Number(t.amount || 0);
    monthMap[key].count += 1;
  });

  const monthlyDistribution: ProjectMonthStat[] = Object.entries(monthMap)
    .sort(([k1], [k2]) => k1.localeCompare(k2))
    .map(([key, data]) => ({
      key,
      ...data,
    }));

  const avgCheck = expenseTxs.length > 0 ? totalSpent / expenseTxs.length : 0;

  return {
    projectTxs,
    expenseTxs,
    incomeTxs,
    totalSpent,
    totalIncome,
    netBalance,
    txCount: projectTxs.length,
    firstDate,
    lastDate,
    categories,
    monthlyDistribution,
    avgCheck,
  };
}

interface TagProjectModalProps {
  tag: string | null;
  transactions: Transaction[];
  onClose: () => void;
  onSelectTransaction?: (transaction: Transaction) => void;
}

export function TagProjectModal({
  tag,
  transactions,
  onClose,
  onSelectTransaction,
}: TagProjectModalProps) {
  const [activeTab, setActiveTab] = useState<"overview" | "transactions">(
    "overview"
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (tag) {
      window.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "unset";
    };
  }, [tag, onClose]);

  const metrics = useMemo(() => {
    return calculateProjectMetrics(tag, transactions);
  }, [tag, transactions]);

  if (!tag) return null;

  const formatDateRange = () => {
    if (!metrics.firstDate || !metrics.lastDate) return "Немає операцій";
    const sameYear =
      metrics.firstDate.getFullYear() === metrics.lastDate.getFullYear();
    const sameMonth =
      sameYear && metrics.firstDate.getMonth() === metrics.lastDate.getMonth();
    const sameDay =
      sameMonth && metrics.firstDate.getDate() === metrics.lastDate.getDate();

    if (sameDay) {
      return metrics.firstDate.toLocaleDateString("uk-UA", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    }

    const fromStr = metrics.firstDate.toLocaleDateString("uk-UA", {
      day: "numeric",
      month: "short",
      ...(sameYear ? {} : { year: "numeric" }),
    });
    const toStr = metrics.lastDate.toLocaleDateString("uk-UA", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });

    return `${fromStr} — ${toStr}`;
  };

  const cleanTag = tag.replace(/^#/, "");

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      {/* Підкладка для закриття кліком */}
      <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />

      {/* Контейнер модального вікна / шторки */}
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-xl flex-col overscroll-contain rounded-t-[28px] border border-zinc-800 bg-zinc-950 p-5 pt-3 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl sm:max-h-[85vh] sm:rounded-3xl sm:p-6 sm:pb-6">
        {/* iOS Grabber */}
        <div className="mx-auto mb-3 h-1.5 w-11 shrink-0 rounded-full bg-zinc-700/50 sm:hidden" />

        {/* Заголовок */}
        <div className="mb-4 flex items-start justify-between border-b border-zinc-800/80 pb-3.5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-sky-500/30 bg-sky-500/10 text-sky-400">
              <FolderKanban size={20} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="truncate text-base font-bold text-white">
                  #{cleanTag}
                </h2>
                <span className="rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[10px] font-semibold text-sky-400">
                  Крос-період
                </span>
              </div>
              <p className="flex items-center gap-1.5 text-xs text-zinc-400">
                <Calendar size={12} className="text-zinc-500" />
                {formatDateRange()}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-zinc-800/80 bg-zinc-900/60 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white active:scale-95"
          >
            <X size={16} />
          </button>
        </div>

        {/* Перемикач вкладок */}
        <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl border border-zinc-800/80 bg-zinc-900/50 p-1">
          <button
            type="button"
            onClick={() => setActiveTab("overview")}
            className={`rounded-lg py-1.5 text-xs font-semibold transition-all ${
              activeTab === "overview"
                ? "bg-zinc-800 text-white shadow-xs"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            Аналітика проєкту
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("transactions")}
            className={`flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition-all ${
              activeTab === "transactions"
                ? "bg-zinc-800 text-white shadow-xs"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Receipt size={13} />
            Чеків ({metrics.txCount})
          </button>
        </div>

        {/* Контент модалки */}
        <div className="[scrollbar-width:thin] space-y-4 overflow-y-auto overscroll-contain pr-1">
          {activeTab === "overview" ? (
            <>
              {/* Зведені картки метрик */}
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-xl border border-zinc-800/70 bg-zinc-900/40 p-3">
                  <span className="block text-[10px] font-medium tracking-wider text-zinc-500 uppercase">
                    Витрачено
                  </span>
                  <span className="font-mono text-sm font-bold text-rose-400 tabular-nums">
                    {metrics.totalSpent.toLocaleString("uk-UA", {
                      maximumFractionDigits: 0,
                    })}{" "}
                    ₴
                  </span>
                </div>

                <div className="rounded-xl border border-zinc-800/70 bg-zinc-900/40 p-3">
                  <span className="block text-[10px] font-medium tracking-wider text-zinc-500 uppercase">
                    Чеки
                  </span>
                  <span className="font-mono text-sm font-bold text-zinc-200 tabular-nums">
                    {metrics.expenseTxs.length}{" "}
                    <span className="text-xs font-normal text-zinc-500">
                      оп.
                    </span>
                  </span>
                </div>

                <div className="rounded-xl border border-zinc-800/70 bg-zinc-900/40 p-3">
                  <span className="block text-[10px] font-medium tracking-wider text-zinc-500 uppercase">
                    Сер. чек
                  </span>
                  <span className="font-mono text-sm font-bold text-zinc-200 tabular-nums">
                    {Math.round(metrics.avgCheck).toLocaleString("uk-UA")} ₴
                  </span>
                </div>
              </div>

              {/* Якщо у проєкті були доходи/надходження */}
              {metrics.totalIncome > 0 && (
                <div className="flex items-center justify-between rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs">
                  <div className="flex items-center gap-2 text-emerald-400">
                    <TrendingUp size={14} />
                    <span>Надходження за проєктом:</span>
                  </div>
                  <span className="font-mono font-bold text-emerald-400 tabular-nums">
                    +{metrics.totalIncome.toLocaleString("uk-UA")} ₴
                  </span>
                </div>
              )}

              {/* Розбивка за категоріями у проєкті */}
              {metrics.categories.length > 0 && (
                <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/30 p-4">
                  <h3 className="mb-3 text-[11px] font-semibold tracking-wider text-zinc-400 uppercase">
                    Розподіл за категоріями
                  </h3>
                  <div className="space-y-3">
                    {metrics.categories.map((cat) => {
                      const IconComponent =
                        CATEGORY_ICONS[cat.name] || HelpCircle;
                      const color = CATEGORY_COLORS[cat.name] || "#71717A";

                      return (
                        <div key={cat.name} className="space-y-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2">
                              <span
                                className="flex h-5 w-5 shrink-0 items-center justify-center rounded"
                                style={{
                                  backgroundColor: `${color}20`,
                                  color,
                                }}
                              >
                                <IconComponent size={12} />
                              </span>
                              <span className="font-medium text-zinc-200">
                                {cat.name}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 font-mono tabular-nums">
                              <span className="text-zinc-200">
                                {cat.amount.toLocaleString("uk-UA")} ₴
                              </span>
                              <span className="text-[11px] text-zinc-500">
                                ({cat.percentage.toFixed(0)}%)
                              </span>
                            </div>
                          </div>
                          {/* Прогрес-бар */}
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
                            <div
                              className="h-full rounded-full transition-all duration-300"
                              style={{
                                width: `${cat.percentage}%`,
                                backgroundColor: color,
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Динаміка за місяцями (якщо витрати тривають понад 1 місяць) */}
              {metrics.monthlyDistribution.length > 1 && (
                <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/30 p-4">
                  <h3 className="mb-3 text-[11px] font-semibold tracking-wider text-zinc-400 uppercase">
                    Динаміка за місяцями
                  </h3>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {metrics.monthlyDistribution.map((m) => (
                      <div
                        key={m.key}
                        className="rounded-xl border border-zinc-800/60 bg-zinc-900/60 p-2.5"
                      >
                        <span className="block text-[11px] font-medium text-zinc-400">
                          {m.label}
                        </span>
                        <div className="mt-1 flex items-baseline justify-between">
                          <span className="font-mono text-xs font-bold text-zinc-200 tabular-nums">
                            {m.amount.toLocaleString("uk-UA")} ₴
                          </span>
                          <span className="text-[10px] text-zinc-500">
                            {m.count} оп.
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            /* Вкладка чеків проєкту */
            <div className="space-y-2">
              {metrics.projectTxs.length === 0 ? (
                <div className="py-12 text-center text-zinc-500">
                  <Receipt size={32} className="mx-auto mb-2 opacity-40" />
                  <p className="text-xs">
                    Операцій із тегом #{cleanTag} не знайдено
                  </p>
                </div>
              ) : (
                metrics.projectTxs.map((t) => {
                  const IconComponent =
                    CATEGORY_ICONS[t.category_name] || HelpCircle;
                  const iconColor =
                    CATEGORY_COLORS[t.category_name] || "#71717A";
                  const isIncome = t.type === "income";

                  return (
                    <div
                      key={t.id}
                      onClick={() => {
                        onClose();
                        onSelectTransaction?.(t);
                      }}
                      className="group flex cursor-pointer items-center justify-between rounded-xl border border-zinc-800/60 bg-zinc-900/40 p-3 transition-all duration-150 hover:translate-x-0.5 hover:border-zinc-700 hover:bg-zinc-900/80 active:scale-[0.99]"
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
                            {new Date(t.created_at).toLocaleDateString(
                              "uk-UA",
                              {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                              }
                            )}
                          </p>
                          {(t.metadata?.comment || t.metadata?.note) && (
                            <p className="mt-0.5 max-w-[260px] truncate text-[11px] text-zinc-400 italic sm:max-w-md">
                              “{t.metadata.comment || t.metadata.note}”
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="text-right">
                        <p
                          className={`font-mono text-sm font-bold tabular-nums ${
                            isIncome ? "text-emerald-400" : "text-zinc-100"
                          }`}
                        >
                          {isIncome ? "+" : "-"}
                          {Number(t.amount).toLocaleString("uk-UA", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}{" "}
                          ₴
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
