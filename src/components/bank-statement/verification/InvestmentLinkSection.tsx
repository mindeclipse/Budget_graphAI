"use client";

import React from "react";
import { TrendingUp, Info } from "lucide-react";
import { InvestmentAsset } from "@/types/finance";

interface InvestmentLinkSectionProps {
  selectedAssetId: string;
  onChangeAssetId: (id: string) => void;
  sortedInvestments: InvestmentAsset[];
  updateAssetCostBasis: boolean;
  onChangeUpdateCostBasis: (val: boolean) => void;
  amount: string;
}

export const InvestmentLinkSection: React.FC<InvestmentLinkSectionProps> = ({
  selectedAssetId,
  onChangeAssetId,
  sortedInvestments,
  updateAssetCostBasis,
  onChangeUpdateCostBasis,
  amount,
}) => {
  return (
    <div className="space-y-3 rounded-2xl border border-emerald-500/20 bg-emerald-950/10 p-3.5">
      <div className="flex items-center gap-2 text-xs font-semibold text-emerald-300">
        <TrendingUp size={15} className="text-emerald-400" />
        <span>Прив&apos;язка до активу портфеля (опціонально)</span>
      </div>

      <div>
        <label className="mb-1 block text-[11px] text-zinc-400">
          Оберіть випуск ОВДП або інвестиційний актив:
        </label>
        <select
          value={selectedAssetId}
          onChange={(e) => onChangeAssetId(e.target.value)}
          className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-white outline-none focus:border-emerald-500/50"
        >
          <option value="none">
            Без прив&apos;язки (тільки операція в капіталі)
          </option>
          {sortedInvestments.map((asset) => (
            <option key={asset.id} value={String(asset.id)}>
              [{asset.asset_type.toUpperCase()}] {asset.asset_name} (
              {Number(asset.invested_amount).toLocaleString("uk-UA")}{" "}
              {asset.currency})
            </option>
          ))}
        </select>
      </div>

      {selectedAssetId !== "none" && (
        <div className="space-y-2 border-t border-emerald-500/10 pt-2.5">
          <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-300">
            <input
              type="checkbox"
              checked={updateAssetCostBasis}
              onChange={(e) => onChangeUpdateCostBasis(e.target.checked)}
              className="h-4 w-4 rounded border-zinc-700 bg-zinc-800 text-emerald-500 focus:ring-0"
            />
            <span>
              Збільшити собівартість (
              <code className="text-[11px] text-emerald-400">
                invested_amount
              </code>
              ) на +{parseFloat(amount || "0").toLocaleString("uk-UA")} ₴
            </span>
          </label>

          <div className="flex items-start gap-2 rounded-xl border border-zinc-800/80 bg-zinc-900/60 p-2.5 text-[11px] leading-relaxed text-zinc-400">
            <Info size={14} className="mt-0.5 shrink-0 text-emerald-400" />
            <span>
              Сума збільшить фактично вкладені кошти (собівартість). Поточну
              ринкову вартість (
              <code className="text-zinc-300">current_value</code>) ви зможете
              оновити пізніше через звіт Inzhur або вручну в картці інвестицій.
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
