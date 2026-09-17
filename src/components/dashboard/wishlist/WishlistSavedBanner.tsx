"use client";

import { ShieldCheck } from "lucide-react";

interface WishlistSavedBannerProps {
  totalSaved: number;
  coolingCount: number;
  readyCount: number;
}

export function WishlistSavedBanner({
  totalSaved,
  coolingCount,
  readyCount,
}: WishlistSavedBannerProps) {
  return (
    <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3.5">
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400">
          <ShieldCheck className="h-4 w-4" />
        </div>
        <div>
          <span className="text-xs font-medium text-emerald-300">
            Врятовано від імпульсивних покупок
          </span>
          <div className="text-lg font-bold text-emerald-400">
            {totalSaved.toLocaleString("uk-UA")} ₴
          </div>
        </div>
      </div>
      <div className="hidden text-right text-xs text-slate-400 sm:block">
        <div>
          На паузі:{" "}
          <span className="font-semibold text-slate-200">{coolingCount}</span>
        </div>
        <div>
          До рішення:{" "}
          <span className="font-semibold text-amber-400">{readyCount}</span>
        </div>
      </div>
    </div>
  );
}
