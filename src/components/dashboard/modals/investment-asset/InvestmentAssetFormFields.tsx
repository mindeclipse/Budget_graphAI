"use client";

import React from "react";
import { Calendar } from "lucide-react";
import { formatIsoToDisplayDate } from "./date-utils";

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
}) => {
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
              clearError();
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
              clearError();
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
              clearError();
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
                clearError();
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
    </>
  );
};
