"use client";

import React from "react";
import { Calendar, Plus, Trash2, Calculator } from "lucide-react";
import { formatIsoToDisplayDate } from "./date-utils";
import { BondCoupon } from "@/types/finance";
import { parseFlexibleNumber } from "@/lib/normalize";

interface InvestmentAssetFormFieldsProps {
  name: string;
  setName: (val: string) => void;
  assetType: "bonds" | "stocks" | "reit" | "crypto" | "deposit" | "other";
  setAssetType: (val: any) => void;
  currency: string;
  setCurrency: (val: string) => void;
  invested: string;
  setInvested: (val: string) => void;
  currentVal: string;
  setCurrentVal: (val: string) => void;
  yieldPct: string;
  setYieldPct: (val: string) => void;
  maturityDateInput: string;
  setMaturityDateInput: (val: string) => void;
  notes: string;
  setNotes: (val: string) => void;
  clearError: () => void;
  hiddenDatePickerRef: React.RefObject<HTMLInputElement | null>;
  // Поля виключно для ОВДП
  quantity: string;
  setQuantity: (val: string) => void;
  couponAmount: string;
  setCouponAmount: (val: string) => void;
  coupons: BondCoupon[];
  setCoupons: React.Dispatch<React.SetStateAction<BondCoupon[]>>;
}

export const InvestmentAssetFormFields: React.FC<
  InvestmentAssetFormFieldsProps
> = ({
  name,
  setName,
  assetType,
  setAssetType,
  currency,
  setCurrency,
  invested,
  setInvested,
  currentVal,
  setCurrentVal,
  yieldPct,
  setYieldPct,
  maturityDateInput,
  setMaturityDateInput,
  notes,
  setNotes,
  clearError,
  hiddenDatePickerRef,
  quantity,
  setQuantity,
  couponAmount,
  setCouponAmount,
  coupons,
  setCoupons,
}) => {
  const isBonds = assetType === "bonds";

  // Розрахунок добутку: кількість * сума 1 купона
  const quantityNum = parseFlexibleNumber(quantity);
  const couponAmountNum = parseFlexibleNumber(couponAmount);
  const calculatedPayout =
    quantityNum > 0 && couponAmountNum > 0
      ? Math.round(quantityNum * couponAmountNum * 100) / 100
      : 0;

  // Сума всіх вже доданих купонів
  const totalCouponsSum = coupons.reduce(
    (sum, c) => sum + (Number(c.amount) || 0),
    0
  );

  const handleAddEmptyCoupon = () => {
    const today = new Date().toISOString().slice(0, 10);
    setCoupons((prev) => [
      ...prev,
      {
        id: `c-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        date: today,
        amount: calculatedPayout > 0 ? calculatedPayout : 0,
      },
    ]);
  };

  const handleAddCalculatedCoupon = () => {
    if (calculatedPayout <= 0) return;
    const today = new Date().toISOString().slice(0, 10);
    setCoupons((prev) => [
      ...prev,
      {
        id: `c-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        date: today,
        amount: calculatedPayout,
      },
    ]);
  };

  const handleUpdateCoupon = (
    index: number,
    field: "date" | "amount",
    value: string
  ) => {
    setCoupons((prev) => {
      const copy = [...prev];
      if (field === "date") {
        copy[index] = { ...copy[index], date: value };
      } else {
        const parsed = parseFlexibleNumber(value);
        copy[index] = { ...copy[index], amount: isNaN(parsed) ? 0 : parsed };
      }
      return copy;
    });
  };

  const handleRemoveCoupon = (index: number) => {
    setCoupons((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <>
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
            clearError();
          }}
          className="w-full rounded-xl border border-zinc-700/80 bg-zinc-900 px-3.5 py-2.5 text-base text-white focus:border-indigo-500 focus:outline-none sm:text-sm"
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
            className="w-full rounded-xl border border-zinc-700/80 bg-zinc-900 px-3 py-2.5 text-base text-white focus:border-indigo-500 focus:outline-none sm:text-sm"
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
            className="w-full rounded-xl border border-zinc-700/80 bg-zinc-900 px-3 py-2.5 text-base text-white focus:border-indigo-500 focus:outline-none sm:text-sm"
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
              clearError();
            }}
            className="w-full rounded-xl border border-zinc-700/80 bg-zinc-900 px-3.5 py-2.5 text-base text-white focus:border-indigo-500 focus:outline-none sm:text-sm"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-zinc-300">
            {isBonds ? "Поточна вартість (Тіло)" : "Поточна вартість"}
          </label>
          <input
            type="text"
            inputMode="decimal"
            required
            placeholder="11500"
            value={currentVal}
            onChange={(e) => {
              setCurrentVal(e.target.value);
              clearError();
            }}
            className="w-full rounded-xl border border-zinc-700/80 bg-zinc-900 px-3.5 py-2.5 text-base text-white focus:border-indigo-500 focus:outline-none sm:text-sm"
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
              clearError();
            }}
            className="w-full rounded-xl border border-zinc-700/80 bg-zinc-900 px-3.5 py-2.5 text-base text-white focus:border-indigo-500 focus:outline-none sm:text-sm"
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
                clearError();
              }}
              className="w-full rounded-xl border border-zinc-700/80 bg-zinc-900 py-2.5 pr-9 pl-3.5 text-base text-white placeholder-zinc-500 focus:border-indigo-500 focus:outline-none sm:text-sm"
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
              ref={hiddenDatePickerRef as any}
              type="date"
              tabIndex={-1}
              aria-hidden="true"
              className="pointer-events-none absolute bottom-0 left-0 h-0 w-0 opacity-0"
              onChange={(e) => {
                if (e.target.value) {
                  setMaturityDateInput(formatIsoToDisplayDate(e.target.value));
                  clearError();
                }
              }}
            />
          </div>
        </div>
      </div>

      {/* СПЕЦІАЛЬНИЙ БЛОК: Виключно для активів ОВДП (Облігації) */}
      {isBonds && (
        <div className="space-y-3 rounded-2xl border border-indigo-500/30 bg-indigo-950/20 p-3.5 sm:p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-indigo-500/20 text-xs text-indigo-300">
                🏛️
              </span>
              <span className="text-xs font-bold text-indigo-200">
                Параметри ОВДП та Купонні виплати
              </span>
            </div>
            {totalCouponsSum > 0 && (
              <span className="rounded-lg bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-400">
                Всього купонів: +{totalCouponsSum.toLocaleString()} {currency}
              </span>
            )}
          </div>

          {/* Кількість та сума купона */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[11px] font-medium text-zinc-300">
                Кількість облігацій (шт.)
              </label>
              <input
                type="text"
                inputMode="numeric"
                placeholder="напр. 30"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="w-full rounded-xl border border-zinc-700/80 bg-zinc-900 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-medium text-zinc-300">
                Сума купона на 1 шт ({currency})
              </label>
              <input
                type="text"
                inputMode="decimal"
                placeholder="напр. 75.50"
                value={couponAmount}
                onChange={(e) => setCouponAmount(e.target.value)}
                className="w-full rounded-xl border border-zinc-700/80 bg-zinc-900 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Розрахована виплата */}
          {calculatedPayout > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-indigo-500/20 bg-indigo-500/10 px-3 py-2 text-xs">
              <span className="flex items-center gap-1.5 text-zinc-300">
                <Calculator size={13} className="text-indigo-400" />
                <span>
                  Виплата за випуск:{" "}
                  <strong className="text-white">
                    {quantityNum} шт × {couponAmountNum} ={" "}
                    {calculatedPayout.toLocaleString()} {currency}
                  </strong>
                </span>
              </span>
              <button
                type="button"
                onClick={handleAddCalculatedCoupon}
                className="rounded-lg bg-indigo-500 px-2.5 py-1 text-[11px] font-bold text-white shadow-sm transition-all hover:bg-indigo-600 active:scale-95"
              >
                + Додати цю виплату
              </button>
            </div>
          )}

          {/* Список купонних виплат */}
          <div className="space-y-2 border-t border-indigo-500/20 pt-2.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-semibold text-zinc-300">
                Історія та графік купонних виплат ({coupons.length})
              </span>
              <button
                type="button"
                onClick={handleAddEmptyCoupon}
                className="flex items-center gap-1 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-2 py-1 text-xs font-semibold text-indigo-300 transition-colors hover:bg-indigo-500/20"
              >
                <Plus size={12} />
                <span>Додати виплату</span>
              </button>
            </div>

            {coupons.length === 0 ? (
              <p className="py-1 text-[11px] text-zinc-500 italic">
                Виплат ще не додано. Натисніть «Додати виплату» для внесення
                дати та суми купона.
              </p>
            ) : (
              <div className="max-h-44 [scrollbar-width:thin] space-y-2 overflow-y-auto pr-1">
                {coupons.map((coupon, idx) => (
                  <div
                    key={coupon.id || idx}
                    className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950/80 p-2"
                  >
                    <div className="flex-1">
                      <input
                        type="date"
                        value={coupon.date}
                        onChange={(e) =>
                          handleUpdateCoupon(idx, "date", e.target.value)
                        }
                        className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-xs text-white focus:border-indigo-500 focus:outline-none"
                      />
                    </div>
                    <div className="w-28 sm:w-32">
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder="Сума купона"
                        value={coupon.amount || ""}
                        onChange={(e) =>
                          handleUpdateCoupon(idx, "amount", e.target.value)
                        }
                        className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-xs text-white placeholder-zinc-600 focus:border-indigo-500 focus:outline-none"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveCoupon(idx)}
                      className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-rose-400"
                      title="Видалити виплату"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div>
        <label className="mb-1.5 block text-xs font-medium text-zinc-300">
          Нотатки (опціонально)
        </label>
        <input
          type="text"
          placeholder="Брокер, рахунок, ISIN тощо..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full rounded-xl border border-zinc-700/80 bg-zinc-900 px-3.5 py-2.5 text-base text-white focus:border-indigo-500 focus:outline-none sm:text-sm"
        />
      </div>
    </>
  );
};
