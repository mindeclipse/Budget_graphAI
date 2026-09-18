"use client";

import { useState, useEffect } from "react";
import {
  X,
  Check,
  ArrowDownLeft,
  ShieldAlert,
  CalendarDays,
} from "lucide-react";
import { useTransactionMutations } from "@/hooks/useTransactionMutations";
import { CATEGORIES } from "@/constants/categories";
import { triggerHaptic } from "@/lib/haptics";

interface CreateTransactionDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CreateTransactionDrawer({
  isOpen,
  onClose,
}: CreateTransactionDrawerProps) {
  const { createTransaction } = useTransactionMutations();
  const [amount, setAmount] = useState("");
  const [merchant, setMerchant] = useState("");
  const [category, setCategory] = useState("Продукти");
  const [isEmergency, setIsEmergency] = useState(false);
  const [amortizationMonths, setAmortizationMonths] = useState(1);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
      setIsEmergency(false);
      setAmortizationMonths(1);
    }
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "unset";
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmount = parseFloat(amount.replace(",", "."));
    if (
      !parsedAmount ||
      isNaN(parsedAmount) ||
      parsedAmount <= 0 ||
      parsedAmount > 10_000_000
    ) {
      return;
    }

    const cleanMerchant = merchant.trim().slice(0, 255) || "Ручна витрата";
    const isInvestment = category === "Інвестиції";

    const metadata: Record<string, any> = {};
    const tags: string[] = [];

    if (isEmergency) {
      metadata.is_emergency = true;
      tags.push("форсмажор");
    } else if (amortizationMonths > 1) {
      metadata.amortization = {
        months: amortizationMonths,
        monthly_amount: Math.round(parsedAmount / amortizationMonths),
        start_date: new Date().toISOString(),
      };
    }

    triggerHaptic("success");
    createTransaction({
      amount: parsedAmount,
      merchant_raw: cleanMerchant,
      category_name: category,
      type: isInvestment ? "investment" : "expense",
      currency: "UAH",
      source: "manual",
      exclude_from_budget: isInvestment,
      tags: tags.length > 0 ? tags : undefined,
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
      created_at: new Date().toISOString(),
    });

    setAmount("");
    setMerchant("");
    setIsEmergency(false);
    setAmortizationMonths(1);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      {/* Клік по підкладці закриває форму */}
      <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />

      {/* Адаптивна шторка для iPhone / Центрована картка для десктопу */}
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-md flex-col overscroll-contain rounded-t-[28px] border border-zinc-800 bg-zinc-950 p-5 pt-3 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl sm:max-h-[85vh] sm:rounded-3xl sm:p-6 sm:pb-6">
        {/* Grabber Bar для iOS */}
        <div className="mx-auto mb-3 h-1.5 w-11 shrink-0 rounded-full bg-zinc-700/50 sm:hidden" />

        {/* Шапка модалки */}
        <div className="mb-4 flex items-center justify-between border-b border-zinc-800/80 pb-3.5">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-500/10 text-rose-400">
              <ArrowDownLeft size={16} />
            </div>
            <h2 className="text-base font-bold text-white">Нова витрата</h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900/60 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white active:scale-95"
          >
            <X size={16} />
          </button>
        </div>

        {/* Форма внесення витрати */}
        <form
          onSubmit={handleSubmit}
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <div className="flex-1 [scrollbar-width:thin] space-y-4 overflow-y-auto overscroll-contain pr-0.5">
            {/* Поле введення суми */}
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold tracking-wider text-zinc-400 uppercase">
                Сума
              </label>
              <div className="relative flex items-center">
                <input
                  type="text"
                  inputMode="decimal"
                  required
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full rounded-2xl border border-zinc-800 bg-zinc-900/80 px-4 py-3 pr-12 font-mono text-2xl font-bold tracking-tight text-white tabular-nums placeholder-zinc-700 transition-colors focus:border-zinc-600 focus:outline-none"
                />
                <span className="pointer-events-none absolute right-4 text-base font-bold text-zinc-500">
                  ₴
                </span>
              </div>
            </div>

            {/* Заклад або опис */}
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold tracking-wider text-zinc-400 uppercase">
                Заклад / Опис
              </label>
              <input
                type="text"
                placeholder="Сільпо, Кава, Аптека тощо..."
                value={merchant}
                onChange={(e) => setMerchant(e.target.value)}
                className="w-full rounded-xl border border-zinc-800 bg-zinc-900/80 px-3.5 py-2.5 text-base text-white placeholder-zinc-600 transition-colors focus:border-zinc-600 focus:outline-none sm:text-xs"
              />
            </div>

            {/* Вибір категорії */}
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold tracking-wider text-zinc-400 uppercase">
                Категорія
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-xl border border-zinc-800 bg-zinc-900/80 px-3 py-2.5 text-base text-zinc-200 transition-colors focus:border-zinc-600 focus:outline-none sm:text-xs"
              >
                {CATEGORIES.map((cat) => (
                  <option
                    key={cat}
                    value={cat}
                    className="bg-zinc-900 text-zinc-200"
                  >
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            {/* Покриття з Фінансової подушки (форс-мажор) */}
            {category !== "Інвестиції" && (
              <label className="flex cursor-pointer items-start justify-between gap-3 rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-3 transition-colors">
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
                      Позначає витрату для ШІ як вимушену екстрену потребу, щоб
                      вона не вважалася споживчим марнотратством.
                    </p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={isEmergency}
                  onChange={(e) => {
                    triggerHaptic("selection");
                    setIsEmergency(e.target.checked);
                  }}
                  className="mt-1 h-4 w-4 rounded border-zinc-700 bg-zinc-800 text-amber-500 focus:ring-0 focus:ring-offset-0"
                />
              </label>
            )}

            {/* Розподіл витрати на кілька місяців (амортизація) */}
            {!isEmergency &&
              category !== "Інвестиції" &&
              parseFloat(amount.replace(",", ".") || "0") > 0 && (
                <div className="space-y-2 rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-200">
                      <CalendarDays size={14} className="text-indigo-400" />
                      🗓️ Розподіл (амортизація)
                    </div>
                    {amortizationMonths > 1 && (
                      <span className="font-mono text-[11px] font-bold text-indigo-400">
                        по ~
                        {Math.round(
                          parseFloat(amount.replace(",", ".")) /
                            amortizationMonths
                        ).toLocaleString("uk-UA")}{" "}
                        ₴/міс
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-5 gap-1.5 pt-0.5">
                    {[1, 2, 3, 6, 12].map((m) => {
                      const isSelected = amortizationMonths === m;
                      return (
                        <button
                          key={m}
                          type="button"
                          onClick={() => {
                            triggerHaptic("selection");
                            setAmortizationMonths(m);
                          }}
                          className={`rounded-xl py-1 text-center text-xs font-semibold transition-all active:scale-95 ${
                            isSelected
                              ? "bg-indigo-600 text-white shadow-sm ring-1 ring-indigo-400"
                              : "border border-zinc-800 bg-zinc-900/80 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
                          }`}
                        >
                          {m === 1 ? "1 міс" : `${m} міс`}
                        </button>
                      );
                    })}
                  </div>
                  {amortizationMonths > 1 && (
                    <div className="rounded-lg border border-indigo-800/30 bg-indigo-950/40 px-2.5 py-1.5 text-[11px] text-indigo-300">
                      💡 З балансу списується вся сума — гроші не повертаються
                      віртуально. ШІ та аналітика зафіксують це як планову
                      інвестицію на {amortizationMonths} міс, а не разове
                      марнотратство.
                    </div>
                  )}
                </div>
              )}
          </div>

          {/* Кнопка збереження */}
          <div className="shrink-0 pt-3">
            <button
              type="submit"
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-sky-600 py-3 text-xs font-bold text-white shadow-lg shadow-sky-950/40 transition-all hover:bg-sky-500 active:scale-[0.98]"
            >
              <Check size={16} /> Зберегти витрату
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
