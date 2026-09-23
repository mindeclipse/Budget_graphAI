import { Percent, Calendar, Edit2, Trash2 } from "lucide-react";
import { InvestmentAsset } from "@/types/finance";
import { ASSET_TYPE_LABELS, calculateAssetPnl } from "./types";

interface AssetItemRowProps {
  asset: InvestmentAsset;
  onEdit: (asset: InvestmentAsset) => void;
  onDelete: (id: number) => void;
}

export function AssetItemRow({ asset, onEdit, onDelete }: AssetItemRowProps) {
  const currentVal = Number(asset.current_value) || 0;
  const { diff, pct, receivedCoupons, upcomingCoupons, isProfit } =
    calculateAssetPnl(asset);
  const cfg = ASSET_TYPE_LABELS[asset.asset_type] || ASSET_TYPE_LABELS.other;

  return (
    <div className="group flex items-center justify-between rounded-2xl border border-zinc-800/80 bg-zinc-950/40 p-3 transition-colors hover:border-zinc-700/80">
      <div className="min-w-0 pr-2">
        <div className="flex items-center gap-2">
          <span
            className={`inline-block rounded-md px-1.5 py-0.5 text-[9px] font-bold text-white uppercase ${cfg.color}`}
          >
            {cfg.label}
          </span>
          <h4 className="truncate text-xs font-bold text-white">
            {asset.asset_name}
          </h4>
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-zinc-400">
          <span>
            Поточна:{" "}
            <strong className="text-zinc-200">
              {currentVal.toLocaleString()} {asset.currency}
            </strong>
          </span>
          {receivedCoupons > 0 ? (
            <span
              className="inline-flex items-center gap-0.5 rounded-md bg-emerald-500/10 px-1.5 py-0.5 font-medium text-emerald-400"
              title={`Отримано купонів: ${receivedCoupons.toLocaleString()} ${asset.currency}${
                upcomingCoupons > 0
                  ? ` (ще очікується: ${upcomingCoupons.toLocaleString()} ${asset.currency})`
                  : ""
              }`}
            >
              Купони: +{receivedCoupons.toLocaleString()} {asset.currency}
            </span>
          ) : upcomingCoupons > 0 ? (
            <span
              className="inline-flex items-center gap-0.5 rounded-md bg-zinc-800/80 px-1.5 py-0.5 font-medium text-zinc-400"
              title={`Заплановано в графіку: ${upcomingCoupons.toLocaleString()} ${asset.currency}`}
            >
              Очікується: +{upcomingCoupons.toLocaleString()} {asset.currency}
            </span>
          ) : null}
          {asset.yield_percent && (
            <span className="flex items-center gap-0.5 font-medium text-emerald-400">
              <Percent size={10} /> {asset.yield_percent}%
            </span>
          )}
          {asset.maturity_date && (
            <span className="flex items-center gap-0.5 text-zinc-500">
              <Calendar size={10} />{" "}
              {new Date(asset.maturity_date).toLocaleDateString("uk-UA")}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2.5">
        <div className="text-right">
          <div
            className={`text-xs font-bold tabular-nums ${
              isProfit ? "text-emerald-400" : "text-rose-400"
            }`}
          >
            {isProfit ? "+" : ""}
            {diff.toFixed(0)} {asset.currency}
          </div>
          <div className="text-[10px] text-zinc-500">
            {isProfit ? "+" : ""}
            {pct}%
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onEdit(asset)}
            className="rounded-lg p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
            title="Редагувати актив"
          >
            <Edit2 size={13} />
          </button>
          <button
            type="button"
            onClick={() => onDelete(asset.id)}
            className="rounded-lg p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-rose-400"
            title="Видалити актив"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}
