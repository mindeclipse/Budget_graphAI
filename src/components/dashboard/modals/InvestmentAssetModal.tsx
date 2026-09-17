"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Calendar, Loader2, Plus, CheckCircle2 } from "lucide-react";
import { InvestmentAsset } from "@/types/finance";
import { parseFlexibleNumber } from "@/lib/normalize";

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

export function formatIsoToDisplayDate(iso?: string | null): string {
  if (!iso) return "";
  const parts = iso.split("-");
  if (parts.length === 3) {
    return `${parts[2]}.${parts[1]}.${parts[0]}`;
  }
  return iso;
}

export interface InvestmentAssetModalProps {
  isOpen: boolean;
  asset?: InvestmentAsset | null;
  onClose: () => void;
  onRefresh: () => void | Promise<void>;
}

export function InvestmentAssetModal({
  isOpen,
  asset,
  onClose,
  onRefresh,
}: InvestmentAssetModalProps) {
  const [mounted, setMounted] = useState(false);
  const hiddenDatePickerRef = useRef<HTMLInputElement>(null);

  const isEditing = Boolean(asset);
  const [name, setName] = useState("");
  const [assetType, setAssetType] = useState<
    "bonds" | "stocks" | "reit" | "crypto" | "deposit" | "other"
  >("bonds");
  const [invested, setInvested] = useState("");
  const [currentVal, setCurrentVal] = useState("");
  const [currency, setCurrency] = useState("UAH");
  const [yieldPct, setYieldPct] = useState("");
  const [maturityDateInput, setMaturityDateInput] = useState("");
  const [notes, setNotes] = useState("");
  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    if (asset) {
      setName(asset.asset_name || "");
      setAssetType(asset.asset_type || "bonds");
      setInvested(String(asset.invested_amount || ""));
      setCurrentVal(String(asset.current_value || ""));
      setCurrency(asset.currency || "UAH");
      setYieldPct(asset.yield_percent ? String(asset.yield_percent) : "");
      setMaturityDateInput(formatIsoToDisplayDate(asset.maturity_date));
      setNotes(asset.notes || "");
    } else {
      setName("");
      setAssetType("bonds");
      setInvested("");
      setCurrentVal("");
      setCurrency("UAH");
      setYieldPct("");
      setMaturityDateInput("");
      setNotes("");
    }
    setFormError("");
  }, [isOpen, asset]);

  if (!mounted || !isOpen) return null;

  const handleSaveAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setFormError("Введіть назву активу");
      return;
    }

    const investedNum = parseFlexibleNumber(invested);
    if (isNaN(investedNum) || investedNum < 0) {
      setFormError("Некоректна сума вкладення");
      return;
    }

    const currentNum = parseFlexibleNumber(currentVal);
    if (isNaN(currentNum) || currentNum < 0) {
      setFormError("Некоректна поточна вартість");
      return;
    }

    let parsedYield: number | null = null;
    if (yieldPct.trim()) {
      const yNum = parseFlexibleNumber(yieldPct);
      if (isNaN(yNum)) {
        setFormError("Некоректна ставка дохідності");
        return;
      }
      parsedYield = yNum;
    }

    let parsedMaturity: string | null = null;
    if (maturityDateInput.trim()) {
      parsedMaturity = parseDateInputToIso(maturityDateInput);
      if (!parsedMaturity) {
        setFormError(
          "Некоректний формат дати. Використовуйте ДД.ММ.РРРР (напр. 25.04.2028)"
        );
        return;
      }
    }

    setIsSubmitting(true);
    setFormError("");

    try {
      const payload = {
        id: asset ? asset.id : undefined,
        asset_name: name.trim(),
        asset_type: assetType,
        invested_amount: investedNum,
        current_value: currentNum,
        currency,
        yield_percent: parsedYield,
        maturity_date: parsedMaturity,
        notes: notes.trim() || null,
      };

      const res = await fetch("/api/investments", {
        method: asset ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Помилка збереження активу");
      }

      onClose();
      await onRefresh();
    } catch (err: any) {
      setFormError(err.message || "Помилка сервера при збереженні");
    } finally {
      setIsSubmitting(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />

      <div className="relative z-10 flex max-h-[90dvh] min-h-[60vh] w-full max-w-md flex-col overscroll-contain rounded-t-[28px] border border-zinc-800 bg-zinc-950 shadow-2xl duration-200 sm:max-h-[85vh] sm:min-h-0 sm:rounded-3xl">
        {/* Mobile handle indicator */}
        <div className="mx-auto mt-3 h-1.5 w-11 shrink-0 rounded-full bg-zinc-700/50 sm:hidden" />

        <div className="flex items-center justify-between border-b border-zinc-800/80 px-6 py-4">
          <h4 className="text-base font-semibold text-white">
            {isEditing ? "Редагувати актив" : "Новий інвестиційний актив"}
          </h4>
          <button
            type="button"
            onClick={onClose}
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
                  <span className="text-[10px] text-zinc-500">ДД.ММ.РРРР</span>
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
                    onClick={() => hiddenDatePickerRef.current?.showPicker?.()}
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
              onClick={onClose}
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
              ) : isEditing ? (
                <CheckCircle2 size={14} />
              ) : (
                <Plus size={14} />
              )}
              {isEditing ? "Зберегти" : "Додати"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
