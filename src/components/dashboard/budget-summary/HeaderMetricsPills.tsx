"use client";

import React from "react";

interface HeaderMetricsPillsProps {
  recurringTotal: number;
  transactionCount: number;
}

export function HeaderMetricsPills({
  recurringTotal,
  transactionCount,
}: HeaderMetricsPillsProps) {
  return (
    <>
      <div className="flex items-center gap-1.5 rounded-xl border border-zinc-800/90 bg-zinc-900/80 px-3 py-1.5 shadow-sm">
        <span className="text-zinc-400">Постійні:</span>
        <span className="font-semibold text-white">
          {Math.round(recurringTotal).toLocaleString("uk-UA")} ₴
        </span>
      </div>

      <div className="flex items-center gap-1.5 rounded-xl border border-zinc-800/90 bg-zinc-900/80 px-3 py-1.5 shadow-sm">
        <span className="text-zinc-400">Транзакцій:</span>
        <span className="font-semibold text-white">{transactionCount}</span>
      </div>
    </>
  );
}
