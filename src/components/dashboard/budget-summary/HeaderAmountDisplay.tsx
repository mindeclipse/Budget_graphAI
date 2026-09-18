"use client";

import React from "react";
import { TrendingUp } from "lucide-react";

interface HeaderAmountDisplayProps {
  spentWhole: string;
  spentCents?: string;
}

export function HeaderAmountDisplay({
  spentWhole,
  spentCents,
}: HeaderAmountDisplayProps) {
  return (
    <div>
      <p className="mb-0.5 flex items-center gap-1.5 text-xs font-semibold tracking-widest text-zinc-400 uppercase">
        <TrendingUp size={13} className="text-emerald-400" /> Витрачено за
        період
      </p>
      <h1 className="flex items-baseline gap-0.5 text-4xl font-extrabold tracking-tight md:text-5xl">
        <span className="text-white tabular-nums">{spentWhole}</span>
        {spentCents && (
          <span className="text-2xl font-semibold text-zinc-400 tabular-nums md:text-3xl">
            ,{spentCents}
          </span>
        )}
        <span className="ml-1 text-xl font-light text-zinc-500">₴</span>
      </h1>
    </div>
  );
}
