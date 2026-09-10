"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  TrendingUp,
  Plus,
  ArrowUpRight,
  ArrowDownRight,
  Percent,
  Calendar,
  X,
  Trash2,
  Edit2,
  Loader2,
  PieChart,
} from "lucide-react";
import { InvestmentAsset } from "@/types/finance";
import { parseFlexibleNumber } from "@/lib/normalize";
import { convertToUah } from "@/lib/portfolio-analytics";

export { parseFlexibleNumber };

interface InvestmentsCardProps {
  investments: InvestmentAsset[];
  rates?: { USD: number; EUR: number; PLN: number };
  onRefresh: () => void | Promise<void>;
}

export const ASSET_TYPE_LABELS: Record<
  string,
  { label: string; color: string }
> = {
  bonds: { label: "ОВДП", color: "bg-indigo-500" },
  stocks: { label: "Акції / ETF", color: "bg-sky-500" },
  reit: { label: "REIT", color: "bg-teal-500" },
  crypto: { label: "Крипта", color: "bg-amber-500" },
  deposit: { label: "Депозит", color: "bg-emerald-500" },
  other: { label: "Інше", color: "bg-purple-500" },
};

/**
 * Парсить довільний рядок дати (ДД.ММ.РРРР або РРРР-ММ-ДД) у валідний ISO формат (YYYY-MM-DD)
 */
export function parseDateInputToIso(raw?: string | null): string | null {
  if (!raw) return null;
  const str = raw.trim();
  if (!str) return null;

  // Формат YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const d = new Date(str);
    if (!isNaN(d.getTime())) return str;
  }

  // Формат DD.MM.YYYY або DD/MM/YYYY або DD-MM-YYYY
  const matchDmy = str.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (matchDmy) {
    const day = matchDmy[1].padStart(2, "0");
    const month = matchDmy[2].padStart(2, "0");
    const year = matchDmy[3];
    const iso = `${year}-${month}-${day}`;
    const d = new Date(iso);
    if (!isNaN(d.getTime())) return iso;
  }

  return null;
}

/**
 * Форматує дату з ISO (YYYY-MM-DD) у звичний вигляд для введення (DD.MM.YYYY)
 */
export function formatIsoToDisplayDate(iso?: string | null): string {
  if (!iso) return "";
  const parts = iso.split("-");
  if (parts.length === 3) {
    return `${parts[2]}.${parts[1]}.${parts[0]}`;
  }
  return iso;
}

export function InvestmentsCard({
  investments,
  rates = { USD: 41.5, EUR: 45.3, PLN: 10.6 },
  onRefresh,
}: InvestmentsCardProps) {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [editAsset, setEditAsset] = useState<InvestmentAsset | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    setMounted(true);
  }, []);

  const hiddenDatePickerRef = useRef<HTMLInputElement>(null);

  // Стейт нового/редагованого активу
  const [name, setName] = useState("");
  const [assetType, setAssetType] =
    useState<InvestmentAsset["asset_type"]>("bonds");
  const [invested, setInvested] = useState("");
  const [currentVal, setCurrentVal] = useState("");
  const [currency, setCurrency] = useState("UAH");
  const [yieldPct, setYieldPct] = useState("");
  const [maturityDateInput, setMaturityDateInput] = useState("");
  const [notes, setNotes] = useState("");

  // Розрахунок загальних показників у гривні
  let totalPortfolioUah = 0;
  let totalInvestedUah = 0;
  const typeDistribution: Record<string, number> = {
    bonds: 0,
    stocks: 0,
    reit: 0,
    crypto: 0,
    deposit: 0,
    other: 0,
  };

  investments.forEach((inv) => {
    const invUah = convertToUah(
      Number(inv.invested_amount) || 0,
      inv.currency,
      rates
    );
    const curUah = convertToUah(
      Number(inv.current_value) || 0,
      inv.currency,
      rates
    );

    totalInvestedUah += invUah;
    totalPortfolioUah += curUah;

    const t = inv.asset_type || "other";
    typeDistribution[t] = (typeDistribution[t] || 0) + curUah;
  });

  const netPnlUah = totalPortfolioUah - totalInvestedUah;
  const pnlPercent =
    totalInvestedUah > 0
      ? ((netPnlUah / totalInvestedUah) * 100).toFixed(1)
      : "0";
  const isPositivePnl = netPnlUah >= 0;

  const openAddModal = () => {
    setEditAsset(null);
    setName("");
    setAssetType("bonds");
    setInvested("");
    setCurrentVal("");
    setCurrency("UAH");
    setYieldPct("");
    setMaturityDateInput("");
    setNotes("");
    setFormError("");
    setIsAddModalOpen(true);
  };

  const openEditModal = (asset: InvestmentAsset) => {
    setEditAsset(asset);
    setName(asset.asset_name);
    setAssetType(asset.asset_type);
    setInvested(String(asset.invested_amount));
    setCurrentVal(String(asset.current_value));
    setCurrency(asset.currency);
    setYieldPct(asset.yield_percent ? String(asset.yield_percent) : "");
    setMaturityDateInput(formatIsoToDisplayDate(asset.maturity_date));
    setNotes(asset.notes || "");
    setFormError("");
    setIsAddModalOpen(true);
  };

  const handleSaveAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || isSubmitting) return;

    const investedNum = parseFlexibleNumber(invested);
    const currentNum = parseFlexibleNumber(currentVal);
    const yieldNum = yieldPct.trim() ? parseFlexibleNumber(yieldPct) : null;

    if (investedNum < 0 || currentNum < 0) {
      setFormError("Сума не може бути від'ємною");
      return;
    }

    let parsedMaturity: string | null = null;
    if (maturityDateInput.trim()) {
      parsedMaturity = parseDateInputToIso(maturityDateInput);
      if (!parsedMaturity) {
        setFormError(
          "Вкажіть коректну дату погашення у форматі ДД.ММ.РРРР (наприклад, 25.04.2028)"
        );
        return;
      }
    }

    setIsSubmitting(true);
    setFormError("");

    try {
      const payload = {
        asset_name: name.trim(),
        asset_type: assetType,
        invested_amount: investedNum,
        current_value: currentNum,
        currency,
        yield_percent: yieldNum,
        maturity_date: parsedMaturity,
        notes: notes.trim() || null,
      };

      if (editAsset) {
        const res = await fetch("/api/investments", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: editAsset.id, ...payload }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Помилка оновлення активу");
      } else {
        const res = await fetch("/api/investments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Помилка додавання активу");
      }

      setIsAddModalOpen(false);
      setEditAsset(null);
      await onRefresh();
    } catch (err: any) {
      console.error(err);
      setFormError(err.message || "Помилка збереження активу");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteAsset = async (id: number) => {
    if (!confirm("Видалити цей інвестиційний актив?")) return;
    try {
      const res = await fetch(`/api/investments?id=${id}`, {
        method: "DELETE",
      });
      if (res.ok) await onRefresh();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="rounded-3xl border border-zinc-800/80 bg-zinc-900/60 p-5 backdrop-blur-xl transition-all">
      {/* Шапка картки */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-400">
            <TrendingUp size={20} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">
              Інвестиційний портфель
            </h3>
            <p className="text-xs text-zinc-400">
              Капітал, активи та прибутковість
            </p>
          </div>
        </div>

        <button
          onClick={openAddModal}
          className="flex items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-800/60 px-3 py-1.5 text-xs font-semibold text-zinc-200 transition-colors hover:bg-zinc-700 hover:text-white active:scale-95"
        >
          <Plus size={14} /> Додати актив
        </button>
      </div>

      {/* Метрики портфеля */}
      <div className="mb-5 rounded-2xl border border-zinc-800/80 bg-zinc-950/60 p-4">
        <div className="flex items-baseline justify-between">
          <div>
            <span className="text-xs font-medium text-zinc-400">
              Загальна вартість портфеля
            </span>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-2xl font-extrabold text-white tabular-nums">
                {Math.round(totalPortfolioUah).toLocaleString()}
              </span>
              <span className="text-sm font-semibold text-zinc-400">₴</span>
            </div>
          </div>

          <div
            className={`flex items-center gap-1 rounded-xl px-2.5 py-1 text-xs font-bold tabular-nums ${
              isPositivePnl
                ? "bg-emerald-500/10 text-emerald-400"
                : "bg-rose-500/10 text-rose-400"
            }`}
          >
            {isPositivePnl ? (
              <ArrowUpRight size={14} />
            ) : (
              <ArrowDownRight size={14} />
            )}
            <span>
              {isPositivePnl ? "+" : ""}
              {Math.round(netPnlUah).toLocaleString()} ₴ (
              {isPositivePnl ? "+" : ""}
              {pnlPercent}%)
            </span>
          </div>
        </div>

        {/* Смуга розподілу активів (Asset Allocation) */}
        {totalPortfolioUah > 0 && (
          <div className="mt-4 border-t border-zinc-800/60 pt-3">
            <div className="mb-2 flex items-center justify-between text-[11px] text-zinc-400">
              <span className="flex items-center gap-1 font-medium">
                <PieChart size={12} /> Розподіл активів
              </span>
              <span>
                Вкладено: {Math.round(totalInvestedUah).toLocaleString()} ₴
              </span>
            </div>

            <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-zinc-800">
              {Object.entries(typeDistribution).map(([typeKey, val]) => {
                if (val <= 0) return null;
                const pct = (val / totalPortfolioUah) * 100;
                const cfg =
                  ASSET_TYPE_LABELS[typeKey] || ASSET_TYPE_LABELS.other;

                return (
                  <div
                    key={typeKey}
                    title={`${cfg.label}: ${pct.toFixed(1)}%`}
                    style={{ width: `${pct}%` }}
                    className={`${cfg.color} transition-all duration-300`}
                  />
                );
              })}
            </div>

            <div className="mt-2.5 flex flex-wrap gap-2 text-[10px]">
              {Object.entries(typeDistribution).map(([typeKey, val]) => {
                if (val <= 0) return null;
                const pct = ((val / totalPortfolioUah) * 100).toFixed(0);
                const cfg =
                  ASSET_TYPE_LABELS[typeKey] || ASSET_TYPE_LABELS.other;

                return (
                  <div
                    key={typeKey}
                    className="flex items-center gap-1.5 text-zinc-300"
                  >
                    <span className={`h-2 w-2 rounded-full ${cfg.color}`} />
                    <span>{cfg.label}:</span>
                    <span className="font-semibold text-white">{pct}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Список активів */}
      {investments.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-800 p-6 text-center text-xs text-zinc-500">
          У вас ще немає доданих інвестиційних активів. Додайте ваші ОВДП,
          акції/ETF, REIT, криптовалюту чи банківські депозити.
        </div>
      ) : (
        <div className="space-y-2.5">
          {investments.map((asset) => {
            const investedVal = Number(asset.invested_amount) || 0;
            const currentVal = Number(asset.current_value) || 0;
            const diff = currentVal - investedVal;
            const pct =
              investedVal > 0 ? ((diff / investedVal) * 100).toFixed(1) : "0";
            const isProfit = diff >= 0;
            const cfg =
              ASSET_TYPE_LABELS[asset.asset_type] || ASSET_TYPE_LABELS.other;

            return (
              <div
                key={asset.id}
                className="group flex items-center justify-between rounded-2xl border border-zinc-800/80 bg-zinc-950/40 p-3 transition-colors hover:border-zinc-700/80"
              >
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
                    {asset.yield_percent && (
                      <span className="flex items-center gap-0.5 font-medium text-emerald-400">
                        <Percent size={10} /> {asset.yield_percent}%
                      </span>
                    )}
                    {asset.maturity_date && (
                      <span className="flex items-center gap-0.5 text-zinc-500">
                        <Calendar size={10} />{" "}
                        {new Date(asset.maturity_date).toLocaleDateString(
                          "uk-UA"
                        )}
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
                      onClick={() => openEditModal(asset)}
                      className="rounded-lg p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
                      title="Редагувати актив"
                    >
                      <Edit2 size={13} />
                    </button>
                    <button
                      onClick={() => handleDeleteAsset(asset.id)}
                      className="rounded-lg p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-rose-400"
                      title="Видалити актив"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Модалка додавання / редагування активу */}
      {isAddModalOpen &&
        mounted &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 p-0 backdrop-blur-sm sm:items-center sm:p-4">
            <div
              className="fixed inset-0"
              onClick={() => setIsAddModalOpen(false)}
              aria-hidden="true"
            />

            <div className="relative z-10 flex max-h-[90dvh] min-h-[60vh] w-full max-w-md flex-col overscroll-contain rounded-t-[28px] border border-zinc-800 bg-zinc-950 shadow-2xl duration-200 sm:max-h-[85vh] sm:min-h-0 sm:rounded-3xl">
              {/* Mobile handle indicator */}
              <div className="mx-auto mt-3 h-1.5 w-11 shrink-0 rounded-full bg-zinc-700/50 sm:hidden" />

              <div className="flex items-center justify-between border-b border-zinc-800/80 px-6 py-4">
                <h4 className="text-base font-semibold text-white">
                  {editAsset ? "Редагувати актив" : "Новий інвестиційний актив"}
                </h4>
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-800 hover:text-white"
                >
                  <X size={18} />
                </button>
              </div>

              <form
                onSubmit={handleSaveAsset}
                className="flex min-h-0 flex-1 flex-col overflow-hidden"
              >
                <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
                  {formError && (
                    <p className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-2.5 text-xs text-rose-400">
                      {formError}
                    </p>
                  )}

                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-zinc-300">
                      Назва активу
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="наприклад ОВДП UA400022... або S&P 500"
                      value={name}
                      onChange={(e) => {
                        setName(e.target.value);
                        setFormError("");
                      }}
                      className="w-full rounded-xl border border-zinc-700/80 bg-zinc-900 px-3.5 py-2.5 text-sm text-white focus:border-indigo-500 focus:outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-zinc-300">
                        Тип активу
                      </label>
                      <select
                        value={assetType}
                        onChange={(e) => setAssetType(e.target.value as any)}
                        className="w-full rounded-xl border border-zinc-700/80 bg-zinc-900 px-3 py-2.5 text-sm text-white focus:border-indigo-500 focus:outline-none"
                      >
                        <option value="bonds">ОВДП (Облігації)</option>
                        <option value="stocks">Акції / ETF</option>
                        <option value="reit">REIT</option>
                        <option value="crypto">Криптовалюта</option>
                        <option value="deposit">Депозит</option>
                        <option value="other">Інше</option>
                      </select>
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-zinc-300">
                        Валюта
                      </label>
                      <select
                        value={currency}
                        onChange={(e) => setCurrency(e.target.value)}
                        className="w-full rounded-xl border border-zinc-700/80 bg-zinc-900 px-3 py-2.5 text-sm text-white focus:border-indigo-500 focus:outline-none"
                      >
                        <option value="UAH">UAH (₴)</option>
                        <option value="USD">USD ($)</option>
                        <option value="EUR">EUR (€)</option>
                        <option value="PLN">PLN (zł)</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-zinc-300">
                        Вкладено (Cost)
                      </label>
                      <input
                        type="text"
                        inputMode="decimal"
                        required
                        placeholder="10000"
                        value={invested}
                        onChange={(e) => {
                          setInvested(e.target.value);
                          setFormError("");
                        }}
                        className="w-full rounded-xl border border-zinc-700/80 bg-zinc-900 px-3.5 py-2.5 text-sm text-white focus:border-indigo-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-zinc-300">
                        Поточна вартість
                      </label>
                      <input
                        type="text"
                        inputMode="decimal"
                        required
                        placeholder="11500"
                        value={currentVal}
                        onChange={(e) => {
                          setCurrentVal(e.target.value);
                          setFormError("");
                        }}
                        className="w-full rounded-xl border border-zinc-700/80 bg-zinc-900 px-3.5 py-2.5 text-sm text-white focus:border-indigo-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-zinc-300">
                        Дохідність річна (%)
                      </label>
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder="16.5"
                        value={yieldPct}
                        onChange={(e) => {
                          setYieldPct(e.target.value);
                          setFormError("");
                        }}
                        className="w-full rounded-xl border border-zinc-700/80 bg-zinc-900 px-3.5 py-2.5 text-sm text-white focus:border-indigo-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 flex items-center justify-between text-xs font-medium text-zinc-300">
                        <span>Дата погашення</span>
                        <span className="text-[10px] text-zinc-500">
                          ДД.ММ.РРРР
                        </span>
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          placeholder="напр. 25.04.2028"
                          value={maturityDateInput}
                          onChange={(e) => {
                            setMaturityDateInput(e.target.value);
                            setFormError("");
                          }}
                          className="w-full rounded-xl border border-zinc-700/80 bg-zinc-900 py-2.5 pr-9 pl-3.5 text-sm text-white placeholder-zinc-500 focus:border-indigo-500 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            hiddenDatePickerRef.current?.showPicker?.()
                          }
                          className="absolute top-1/2 right-3 -translate-y-1/2 text-zinc-400 transition-colors hover:text-white"
                          title="Вибрати з календаря"
                        >
                          <Calendar size={15} />
                        </button>
                        <input
                          ref={hiddenDatePickerRef}
                          type="date"
                          tabIndex={-1}
                          aria-hidden="true"
                          className="pointer-events-none absolute bottom-0 left-0 h-0 w-0 opacity-0"
                          onChange={(e) => {
                            if (e.target.value) {
                              setMaturityDateInput(
                                formatIsoToDisplayDate(e.target.value)
                              );
                              setFormError("");
                            }
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-zinc-300">
                      Нотатки (опціонально)
                    </label>
                    <input
                      type="text"
                      placeholder="Брокер, рахунок, умови виплати тощо..."
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="w-full rounded-xl border border-zinc-700/80 bg-zinc-900 px-3.5 py-2.5 text-sm text-white focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="flex gap-3 border-t border-zinc-800/80 px-6 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:pb-4">
                  <button
                    type="button"
                    onClick={() => setIsAddModalOpen(false)}
                    className="flex-1 rounded-xl border border-zinc-800 py-2.5 text-xs font-medium text-zinc-400 hover:bg-zinc-900 hover:text-white"
                  >
                    Скасувати
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-indigo-600 py-2.5 text-xs font-semibold text-white hover:bg-indigo-500 active:scale-95 disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Plus size={14} />
                    )}
                    {editAsset ? "Зберегти" : "Додати"}
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
