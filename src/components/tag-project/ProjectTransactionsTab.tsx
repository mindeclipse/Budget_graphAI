"use client";

import { Receipt, HelpCircle } from "lucide-react";
import { Transaction } from "@/types/finance";
import { CATEGORY_ICONS, CATEGORY_COLORS } from "@/constants/categories";

interface ProjectTransactionsTabProps {
  projectTxs: Transaction[];
  cleanTag: string;
  onClose: () => void;
  onSelectTransaction?: (transaction: Transaction) => void;
}

export function ProjectTransactionsTab({
  projectTxs,
  cleanTag,
  onClose,
  onSelectTransaction,
}: ProjectTransactionsTabProps) {
  if (projectTxs.length === 0) {
    return (
      <div className="py-12 text-center text-zinc-500">
        <Receipt size={32} className="mx-auto mb-2 opacity-40" />
        <p className="text-xs">Операцій із тегом #{cleanTag} не знайдено</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {projectTxs.map((t) => {
        const IconComponent = CATEGORY_ICONS[t.category_name] || HelpCircle;
        const iconColor = CATEGORY_COLORS[t.category_name] || "#71717A";
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
                  {new Date(t.created_at).toLocaleDateString("uk-UA", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
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
      })}
    </div>
  );
}
