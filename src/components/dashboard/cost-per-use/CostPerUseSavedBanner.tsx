"use client";

import { Award } from "lucide-react";

interface CostPerUseSavedBannerProps {
  finalSaved: number;
  itemCount: number;
}

export function CostPerUseSavedBanner({
  finalSaved,
  itemCount,
}: CostPerUseSavedBannerProps) {
  return (
    <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-cyan-500/20 bg-cyan-500/10 p-3.5">
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500/20 text-cyan-400">
          <Award className="h-4 w-4" />
        </div>
        <div>
          <span className="text-xs font-medium text-cyan-300">
            Збережено на сервісах та закладах
          </span>
          <div className="text-lg font-bold text-cyan-400">
            +{finalSaved.toLocaleString("uk-UA")} ₴
          </div>
        </div>
      </div>
      <div className="hidden text-right text-xs text-slate-400 sm:block">
        <div>
          На обліку:{" "}
          <span className="font-semibold text-slate-200">{itemCount}</span>{" "}
          речей
        </div>
        <div>Ціна падає з кожним днем ⚡</div>
      </div>
    </div>
  );
}
