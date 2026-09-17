"use client";

import { ShieldAlert, CalendarDays } from "lucide-react";
import { triggerHaptic } from "@/lib/haptics";

interface ActionSheetAmortizationSectionProps {
  amount: number;
  isEmergency: boolean;
  onToggleEmergency: (val: boolean) => void;
  amortizationMonths: number;
  onChangeAmortization: (months: number) => void;
}

export function ActionSheetAmortizationSection({
  amount,
  isEmergency,
  onToggleEmergency,
  amortizationMonths,
  onChangeAmortization,
}: ActionSheetAmortizationSectionProps) {
  const numericAmount = Number(amount) || 0;

  return (
    <>
      {/* Форс-мажор (непередбачувана екстрена витрата для контексту ШІ та аналітики) */}
      <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-3.5 transition-colors">
        <label className="flex cursor-pointer items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <div
              className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors ${
                isEmergency
                  ? "bg-amber-500/20 text-amber-400"
                  : "bg-zinc-800 text-zinc-400"
              }`}
            >
              <ShieldAlert size={16} />
            </div>
            <div className="text-xs">
              <div className="flex items-center gap-1.5 font-semibold text-zinc-200">
                🛡️ Форс-мажор (екстрена витрата)
              </div>
              <p className="mt-0.5 text-[11px] leading-relaxed text-zinc-400">
                Позначає витрату для ШІ та аналітики як непередбачувану і
                невідворотну потребу (ліки, терміновий ремонт тощо), щоб вона не
                вважалася безсистемним споживчим марнотратством.
              </p>
            </div>
          </div>
          <input
            type="checkbox"
            checked={isEmergency}
            onChange={(e) => {
              triggerHaptic("selection");
              onToggleEmergency(e.target.checked);
            }}
            className="mt-1 h-4 w-4 rounded border-zinc-700 bg-zinc-800 text-amber-500 focus:ring-0 focus:ring-offset-0"
          />
        </label>
      </div>

      {/* Розподіл витрати на кілька місяців (амортизація) */}
      {!isEmergency && numericAmount > 0 && (
        <div className="space-y-2.5 rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-200">
              <CalendarDays size={14} className="text-indigo-400" />
              🗓️ Розподіл на кілька місяців (амортизація)
            </div>
            {amortizationMonths > 1 && (
              <span className="font-mono text-[11px] font-bold text-indigo-400">
                по ~
                {Math.round(numericAmount / amortizationMonths).toLocaleString(
                  "uk-UA"
                )}{" "}
                ₴/міс
              </span>
            )}
          </div>
          <p className="text-[11px] leading-relaxed text-zinc-400">
            Для курсів лікування (вітаміни на 3+ міс), страховки або великих
            покупок: вся сума списується з картки одразу, а ШІ та аналітика
            сприймають це як планову інвестицію на кілька місяців, а не разове
            марнотратство.
          </p>
          <div className="grid grid-cols-5 gap-1.5 pt-1">
            {[1, 2, 3, 6, 12].map((m) => {
              const isSelected = amortizationMonths === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    triggerHaptic("selection");
                    onChangeAmortization(m);
                  }}
                  className={`rounded-xl py-1.5 text-center text-xs font-semibold transition-all active:scale-95 ${
                    isSelected
                      ? "bg-indigo-600 text-white shadow-sm ring-1 ring-indigo-400"
                      : "border border-zinc-800 bg-zinc-900/80 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
                  }`}
                >
                  {m === 1 ? "Вимкнено" : `${m} міс`}
                </button>
              );
            })}
          </div>
          {amortizationMonths > 1 && (
            <div className="rounded-lg border border-indigo-800/30 bg-indigo-950/40 px-2.5 py-1.5 text-[11px] text-indigo-300">
              💡 З балансу списується вся сума (
              <b>{numericAmount.toLocaleString("uk-UA")} ₴</b>) — гроші не
              повертаються віртуально. ШІ та аналітика зафіксують це як планову
              інвестицію на {amortizationMonths} міс (по ~
              {Math.round(numericAmount / amortizationMonths).toLocaleString(
                "uk-UA"
              )}{" "}
              ₴/міс), щоб не вважати її разовим марнотратством.
            </div>
          )}
        </div>
      )}
    </>
  );
}
