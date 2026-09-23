"use client";

import { useState, useEffect } from "react";
import {
  X,
  Check,
  ArrowDownLeft,
  ArrowUpRight,
  ShieldAlert,
  CalendarDays,
  Landmark,
} from "lucide-react";
import { useTransactionMutations } from "@/hooks/useTransactionMutations";
import { CATEGORIES, INCOME_CATEGORIES } from "@/constants/categories";
import { triggerHaptic } from "@/lib/haptics";

interface CreateTransactionDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  initialType?: "expense" | "income";
  initialCategory?: string;
  initialMerchant?: string;
}

const INCOME_INVESTMENT_PRESETS = [
  { label: "Купон ОВДП", text: "Нарахування купону ОВДП" },
  { label: "Дивіденди Inzhur", text: "Виплата доходу Inzhur" },
  { label: "Погашення ОВДП", text: "Погашення номіналу ОВДП" },
  { label: "Поповнення рахунку", text: "Поповнення брокерського рахунку" },
];

const EXPENSE_INVESTMENT_PRESETS = [
  { label: "Купівля ОВДП", text: "Купівля облігацій ОВДП" },
  { label: "Купівля Inzhur", text: "Купівля часток Inzhur" },
  { label: "Купівля крипти", text: "Купівля криптовалюти" },
];

export function CreateTransactionDrawer({
  isOpen,
  onClose,
  initialType,
  initialCategory,
  initialMerchant,
}: CreateTransactionDrawerProps) {
  const { createTransaction } = useTransactionMutations();
  const [transactionType, setTransactionType] = useState<"expense" | "income">(
    "expense"
  );
  const [amount, setAmount] = useState("");
  const [merchant, setMerchant] = useState("");
  const [category, setCategory] = useState("Продукти");
  const [date, setDate] = useState(
    () => new Date().toISOString().split("T")[0]
  );
  const [isEmergency, setIsEmergency] = useState(false);
  const [amortizationMonths, setAmortizationMonths] = useState(1);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";

      const startingType = initialType || "expense";
      setTransactionType(startingType);

      if (initialCategory) {
        setCategory(initialCategory);
      } else {
        setCategory(startingType === "income" ? "Інвестиції" : "Продукти");
      }

      setMerchant(initialMerchant || "");
      setDate(new Date().toISOString().split("T")[0]);
      setIsEmergency(false);
      setAmortizationMonths(1);
    }
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "unset";
    };
  }, [isOpen, onClose, initialType, initialCategory, initialMerchant]);

  if (!isOpen) return null;

  const isIncome = transactionType === "income";
  const isInvestment = category === "Інвестиції";
  const isSavings = category === "Заощадження";
  const isCapital = isInvestment || isSavings;

  const handleTypeChange = (type: "expense" | "income") => {
    triggerHaptic("selection");
    setTransactionType(type);
    if (type === "income") {
      if (!INCOME_CATEGORIES.includes(category as any)) {
        setCategory("Інвестиції");
      }
    } else {
      if (!CATEGORIES.includes(category as any)) {
        setCategory("Продукти");
      }
    }
  };

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

    let defaultMerchant = "Ручна витрата";
    if (isIncome) {
      defaultMerchant = isInvestment
        ? "Нарахування купону ОВДП"
        : "Зарахування";
    }
    const cleanMerchant = merchant.trim().slice(0, 255) || defaultMerchant;

    const metadata: Record<string, any> = {};
    const tags: string[] = [];

    if (isCapital) {
      tags.push("капітал");
      if (isInvestment) tags.push("інвестиції");
      if (isSavings) tags.push("заощадження");
    }

    const lowerMerchant = cleanMerchant.toLowerCase();
    if (lowerMerchant.includes("купон")) {
      if (!tags.includes("купон")) tags.push("купон");
      if (!tags.includes("овдп")) tags.push("овдп");
    }
    if (lowerMerchant.includes("овдп") && !tags.includes("овдп")) {
      tags.push("овдп");
    }
    if (
      (lowerMerchant.includes("inzhur") || lowerMerchant.includes("інжур")) &&
      !tags.includes("reit")
    ) {
      tags.push("reit");
    }
    if (lowerMerchant.includes("дивіденд") && !tags.includes("дивіденди")) {
      tags.push("дивіденди");
    }

    if (!isIncome) {
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
    }

    // Визначаємо точний час операції з урахуванням обраної дати
    const selectedDate = new Date(date);
    const now = new Date();
    if (
      selectedDate.getFullYear() === now.getFullYear() &&
      selectedDate.getMonth() === now.getMonth() &&
      selectedDate.getDate() === now.getDate()
    ) {
      selectedDate.setHours(now.getHours(), now.getMinutes(), now.getSeconds());
    } else {
      selectedDate.setHours(12, 0, 0, 0);
    }

    // Для інвестицій фіксуємо тип investment (щоб вони підтягувалися брокерськими вибірками),
    // для звичайного доходу — income, для витрат — expense.
    const txType = isInvestment
      ? "investment"
      : isIncome
        ? "income"
        : "expense";

    // Усі операції капіталу (інвестиції/скарбнички) виключаються з повсякденного споживчого бюджету
    const excludeFromBudget = isCapital;

    triggerHaptic("success");
    createTransaction({
      amount: parsedAmount,
      merchant_raw: cleanMerchant,
      category_name: category,
      type: txType,
      currency: "UAH",
      source: "manual",
      exclude_from_budget: excludeFromBudget,
      tags: tags.length > 0 ? tags : undefined,
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
      created_at: selectedDate.toISOString(),
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
      <div className="relative z-10 flex max-h-[90vh] min-h-0 w-full max-w-md flex-col overscroll-contain rounded-t-[28px] border border-zinc-800 bg-zinc-950 p-5 pt-3 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl sm:max-h-[85vh] sm:rounded-3xl sm:p-6 sm:pb-6">
        {/* Grabber Bar для iOS */}
        <div className="mx-auto mb-3 h-1.5 w-11 shrink-0 rounded-full bg-zinc-700/50 sm:hidden" />

        {/* Шапка модалки */}
        <div className="mb-3 flex items-center justify-between border-b border-zinc-800/80 pb-3">
          <div className="flex items-center gap-2">
            <div
              className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
                isIncome
                  ? "bg-emerald-500/10 text-emerald-400"
                  : "bg-rose-500/10 text-rose-400"
              }`}
            >
              {isIncome ? (
                <ArrowUpRight size={16} />
              ) : (
                <ArrowDownLeft size={16} />
              )}
            </div>
            <h2 className="text-base font-bold text-white">
              {isIncome ? "Нове зарахування" : "Нова витрата"}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900/60 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white active:scale-95"
          >
            <X size={16} />
          </button>
        </div>

        {/* Перемикач типу: Витрата / Зарахування */}
        <div className="mb-3 grid grid-cols-2 gap-1.5 rounded-2xl border border-zinc-800/80 bg-zinc-900/80 p-1">
          <button
            type="button"
            onClick={() => handleTypeChange("expense")}
            className={`flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-bold transition-all active:scale-[0.98] ${
              !isIncome
                ? "border border-rose-500/40 bg-rose-500/15 text-rose-300 shadow-sm"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <ArrowDownLeft
              size={14}
              className={!isIncome ? "text-rose-400" : "text-zinc-500"}
            />
            <span>Витрата</span>
          </button>

          <button
            type="button"
            onClick={() => handleTypeChange("income")}
            className={`flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-bold transition-all active:scale-[0.98] ${
              isIncome
                ? "border border-emerald-500/40 bg-emerald-500/15 text-emerald-300 shadow-sm"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <ArrowUpRight
              size={14}
              className={isIncome ? "text-emerald-400" : "text-zinc-500"}
            />
            <span>Зарахування</span>
          </button>
        </div>

        {/* Форма внесення операції */}
        <form
          onSubmit={handleSubmit}
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <div className="flex-1 [scrollbar-width:thin] space-y-3.5 overflow-y-auto overscroll-contain pr-0.5">
            {/* Поле введення суми */}
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold tracking-wider text-zinc-400 uppercase">
                Сума
              </label>
              <div className="relative flex items-center">
                <span
                  className={`pointer-events-none absolute left-4 font-mono text-xl font-bold ${
                    isIncome ? "text-emerald-400" : "text-zinc-500"
                  }`}
                >
                  {isIncome ? "+" : "−"}
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  required
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className={`w-full rounded-2xl border bg-zinc-900/80 py-3 pr-12 pl-9 font-mono text-2xl font-bold tracking-tight text-white tabular-nums placeholder-zinc-700 transition-colors focus:outline-none ${
                    isIncome
                      ? "border-emerald-500/30 focus:border-emerald-500"
                      : "border-zinc-800 focus:border-zinc-600"
                  }`}
                />
                <span className="pointer-events-none absolute right-4 text-base font-bold text-zinc-500">
                  ₴
                </span>
              </div>
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
                {(isIncome ? INCOME_CATEGORIES : CATEGORIES).map((cat) => (
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

            {/* Заклад або опис */}
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold tracking-wider text-zinc-400 uppercase">
                {isIncome ? "Джерело / Призначення" : "Заклад / Опис"}
              </label>
              <input
                type="text"
                placeholder={
                  isIncome
                    ? isInvestment
                      ? "Нарахування купону ОВДП UA4000... тощо"
                      : "Зарплата, Скарбничка, Бонус..."
                    : "Сільпо, Кава, Аптека тощо..."
                }
                value={merchant}
                onChange={(e) => setMerchant(e.target.value)}
                className="w-full rounded-xl border border-zinc-800 bg-zinc-900/80 px-3.5 py-2.5 text-base text-white placeholder-zinc-600 transition-colors focus:border-zinc-600 focus:outline-none sm:text-xs"
              />

              {/* Швидкі шаблони для Інвестицій */}
              {isInvestment && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(isIncome
                    ? INCOME_INVESTMENT_PRESETS
                    : EXPENSE_INVESTMENT_PRESETS
                  ).map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => {
                        triggerHaptic("selection");
                        setMerchant(preset.text);
                      }}
                      className="rounded-lg border border-zinc-800/90 bg-zinc-900/90 px-2 py-1 text-[11px] font-medium text-zinc-400 transition-all hover:border-emerald-500/40 hover:bg-emerald-500/10 hover:text-emerald-300 active:scale-95"
                    >
                      🏷️ {preset.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Дата операції */}
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold tracking-wider text-zinc-400 uppercase">
                Дата операції
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-xl border border-zinc-800 bg-zinc-900/80 px-3 py-2 text-base text-zinc-200 [color-scheme:dark] transition-colors focus:border-zinc-600 focus:outline-none sm:text-xs"
              />
            </div>

            {/* Інформаційна плашка про вплив на бюджет/капітал */}
            {isCapital ? (
              <div className="flex items-start gap-2 rounded-xl border border-emerald-500/20 bg-emerald-950/20 p-2.5 text-[11px] text-emerald-300">
                <Landmark
                  size={14}
                  className="mt-0.5 shrink-0 text-emerald-400"
                />
                <span>
                  🏛️ <strong>Операція капіталу</strong>: зберігається у вкладці
                  «Капітал & Цілі» та не змінює споживчий ліміт дня.
                </span>
              </div>
            ) : isIncome ? (
              <div className="flex items-start gap-2 rounded-xl border border-sky-500/20 bg-sky-950/20 p-2.5 text-[11px] text-sky-300">
                <ArrowUpRight
                  size={14}
                  className="mt-0.5 shrink-0 text-sky-400"
                />
                <span>
                  💼 <strong>Зарахування доходу</strong>: фіксується як
                  надходження поточного періоду.
                </span>
              </div>
            ) : null}

            {/* Покриття з Фінансової подушки (форс-мажор) — тільки для витрат */}
            {!isIncome && !isCapital && (
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

            {/* Розподіл витрати на кілька місяців (амортизація) — тільки для витрат */}
            {!isIncome &&
              !isEmergency &&
              !isCapital &&
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
              className={`flex w-full items-center justify-center gap-2 rounded-xl py-3 text-xs font-bold text-white shadow-lg transition-all active:scale-[0.98] ${
                isIncome
                  ? "bg-emerald-600 shadow-emerald-950/40 hover:bg-emerald-500"
                  : "bg-sky-600 shadow-sky-950/40 hover:bg-sky-500"
              }`}
            >
              {isIncome ? (
                <>
                  <ArrowUpRight size={16} /> Зберегти зарахування
                </>
              ) : (
                <>
                  <Check size={16} /> Зберегти витрату
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
