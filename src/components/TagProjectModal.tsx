"use client";

import { useEffect, useMemo, useState } from "react";
import { X, FolderKanban, Receipt, Calendar } from "lucide-react";
import { Transaction } from "@/types/finance";
import {
  ProjectCategoryStat,
  ProjectMonthStat,
  ProjectMetricsResult,
  TagProjectModalProps,
} from "./tag-project/types";
import { calculateProjectMetrics } from "./tag-project/metrics";
import { ProjectOverviewTab } from "./tag-project/ProjectOverviewTab";
import { ProjectTransactionsTab } from "./tag-project/ProjectTransactionsTab";

export type {
  ProjectCategoryStat,
  ProjectMonthStat,
  ProjectMetricsResult,
  TagProjectModalProps,
};
export { calculateProjectMetrics };

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
            <ProjectOverviewTab metrics={metrics} />
          ) : (
            <ProjectTransactionsTab
              projectTxs={metrics.projectTxs}
              cleanTag={cleanTag}
              onClose={onClose}
              onSelectTransaction={onSelectTransaction}
            />
          )}
        </div>
      </div>
    </div>
  );
}
