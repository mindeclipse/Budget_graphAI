"use client";

import React from "react";
import { ArrowRight, Edit2, Trash2 } from "lucide-react";
import { MerchantRule } from "@/types/finance";

interface RuleListItemProps {
  rule: MerchantRule;
  isDeleting: boolean;
  onEdit: (rule: MerchantRule) => void;
  onDelete: (pattern: string) => void;
}

export function RuleListItem({
  rule,
  isDeleting,
  onEdit,
  onDelete,
}: RuleListItemProps) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-800/80 bg-zinc-900/50 p-3 transition-colors hover:border-zinc-700/80">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="max-w-[160px] truncate rounded-lg border border-sky-800/40 bg-sky-950/40 px-2 py-0.5 font-mono text-xs font-semibold text-sky-400 sm:max-w-xs">
            {rule.pattern}
          </span>
          <ArrowRight size={12} className="shrink-0 text-zinc-600" />
          <span className="max-w-[140px] truncate text-xs font-semibold text-white">
            {rule.clean_merchant || rule.normalized_name || rule.pattern}
          </span>
        </div>
        <div className="mt-1">
          <span className="inline-flex items-center rounded-md bg-zinc-800/90 px-2 py-0.5 text-[10px] font-medium text-zinc-300">
            {rule.category_name}
          </span>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={() => onEdit(rule)}
          className="flex h-8 w-8 items-center justify-center rounded-xl text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white active:scale-95"
          title="Редагувати правило"
        >
          <Edit2 size={13} />
        </button>

        <button
          type="button"
          onClick={() => {
            if (confirm(`Видалити правило для "${rule.pattern}"?`)) {
              onDelete(rule.pattern);
            }
          }}
          disabled={isDeleting}
          className="flex h-8 w-8 items-center justify-center rounded-xl text-zinc-500 transition-colors hover:bg-rose-500/20 hover:text-rose-400 active:scale-95 disabled:opacity-50"
          title="Видалити правило"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}
