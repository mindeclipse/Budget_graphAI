"use client";

import React, { useState } from "react";
import { createPortal } from "react-dom";
import {
  Archive,
  X,
  RotateCcw,
  Trash2,
  Calendar,
  Percent,
  CheckCircle2,
} from "lucide-react";
import { InvestmentAsset } from "@/types/finance";
import {
  ASSET_TYPE_LABELS,
  calculateAssetPnl,
} from "@/components/dashboard/investments/types";

export interface ArchivedBondsModalProps {
  isOpen: boolean;
  onClose: () => void;
  archivedAssets: InvestmentAsset[];
  onRefresh: () => void | Promise<void>;
  onUpsertOptimistic?: (asset: any) => void;
  onDeleteOptimistic?: (assetId: number) => void;
}

export function ArchivedBondsModal({
  isOpen,
  onClose,
  archivedAssets,
  onRefresh,
  onUpsertOptimistic,
  onDeleteOptimistic,
}: ArchivedBondsModalProps) {
  const [loadingId, setLoadingId] = useState<number | null>(null);

  if (!isOpen) return null;

  const handleRestore = async (asset: InvestmentAsset) => {
    setLoadingId(asset.id);
    const updated = {
      ...asset,
      is_archived: false,
    };
    onUpsertOptimistic?.(updated);
    try {
      const res = await fetch("/api/investments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: asset.id, is_archived: false }),
      });
      if (!res.ok) throw new Error("Не вдалося відновити актив");
      await onRefresh();
    } catch (err) {
      console.error("Помилка відновлення активу:", err);
      await onRefresh();
    } finally {
      setLoadingId(null);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Остаточно видалити цей архівний актив?")) return;
    setLoadingId(id);
    onDeleteOptimistic?.(id);
    try {
      const res = await fetch(`/api/investments?id=${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Помилка видалення");
      await onRefresh();
    } catch (err) {
      console.error("Помилка видалення:", err);
      await onRefresh();
    } finally {
      setLoadingId(null);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />

      <div className="relative z-10 flex max-h-[90dvh] min-h-0 w-full max-w-lg flex-col overscroll-contain rounded-t-[28px] border border-zinc-800 bg-zinc-950 shadow-2xl sm:max-h-[85vh] sm:rounded-3xl">
        {/* Шапка модалки */}
        <div className="flex items-center justify-between border-b border-zinc-800/80 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-700/80 bg-zinc-800/50 text-zinc-300">
              <Archive size={17} />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                Архів інвестицій (погашені ОВДП)
              </h3>
              <p className="text-xs text-zinc-400">
                Завершені випуски та історія купонних виплат
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-1.5 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        {/* Список архівних активів */}
        <div className="flex-1 [scrollbar-width:thin] space-y-3 overflow-y-auto overscroll-contain p-6">
          {archivedAssets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-900/60 text-zinc-600">
                <CheckCircle2 size={24} />
              </div>
              <p className="text-sm font-medium text-zinc-300">
                Архів порожній
              </p>
              <p className="mt-1 max-w-xs text-xs text-zinc-500">
                Коли настане дата погашення ОВДП, або ви перенесете актив в
                архів, він з&apos;явиться тут зі збереженням усієї історії
                купонів.
              </p>
            </div>
          ) : (
            archivedAssets.map((asset) => {
              const cfg =
                ASSET_TYPE_LABELS[asset.asset_type] || ASSET_TYPE_LABELS.other;
              const { diff, pct, totalCoupons, isProfit } =
                calculateAssetPnl(asset);
              const invested = Number(asset.invested_amount) || 0;
              const body = Number(asset.current_value) || 0;

              return (
                <div
                  key={asset.id}
                  className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 transition-colors hover:border-zinc-700/80"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-block rounded-md px-1.5 py-0.5 text-[9px] font-bold text-white uppercase ${cfg.color}`}
                        >
                          {cfg.label}
                        </span>
                        <h4 className="truncate text-sm font-bold text-zinc-200">
                          {asset.asset_name}
                        </h4>
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-400">
                        <span>
                          Тіло (номінал):{" "}
                          <strong className="text-zinc-300">
                            {body.toLocaleString()} {asset.currency}
                          </strong>
                        </span>
                        <span>•</span>
                        <span>
                          Вкладено: {invested.toLocaleString()} {asset.currency}
                        </span>
                      </div>

                      {totalCoupons > 0 && (
                        <div className="mt-1.5 flex items-center gap-2 text-xs">
                          <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 font-medium text-emerald-400">
                            Купони: +{totalCoupons.toLocaleString()}{" "}
                            {asset.currency} ({asset.coupons?.length || 0}{" "}
                            виплат)
                          </span>
                        </div>
                      )}

                      <div className="mt-2 flex items-center gap-3 text-[11px] text-zinc-500">
                        {asset.maturity_date && (
                          <span className="flex items-center gap-1">
                            <Calendar size={11} /> Погашено:{" "}
                            {new Date(asset.maturity_date).toLocaleDateString(
                              "uk-UA"
                            )}
                          </span>
                        )}
                        {asset.yield_percent && (
                          <span className="flex items-center gap-1">
                            <Percent size={11} /> {asset.yield_percent}% річних
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <div className="text-right">
                        <div
                          className={`text-sm font-bold tabular-nums ${
                            isProfit ? "text-emerald-400" : "text-rose-400"
                          }`}
                        >
                          {isProfit ? "+" : ""}
                          {diff.toFixed(0)} {asset.currency}
                        </div>
                        <div className="text-[11px] text-zinc-500">
                          {isProfit ? "+" : ""}
                          {pct}%
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={loadingId === asset.id}
                          onClick={() => handleRestore(asset)}
                          className="flex items-center gap-1 rounded-lg border border-zinc-700/60 bg-zinc-800/60 px-2 py-1 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-700 hover:text-white disabled:opacity-50"
                          title="Відновити актив до основного портфеля"
                        >
                          <RotateCcw size={12} />
                          <span className="text-[11px]">Відновити</span>
                        </button>
                        <button
                          type="button"
                          disabled={loadingId === asset.id}
                          onClick={() => handleDelete(asset.id)}
                          className="rounded-lg p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-rose-400 disabled:opacity-50"
                          title="Остаточно видалити"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Футер */}
        <div className="border-t border-zinc-800/80 px-6 py-3 text-right">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-zinc-700/80 bg-zinc-800 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-zinc-700"
          >
            Закрити
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
