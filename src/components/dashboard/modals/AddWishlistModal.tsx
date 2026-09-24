"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Clock, X, Loader2, PiggyBank, Calendar, Check } from "lucide-react";
import { SavingsGoal } from "@/types/finance";

interface AddWishlistModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => Promise<void> | void;
  onAddOptimistic?: (item: any) => void;
  savingsGoals?: SavingsGoal[];
}

export function AddWishlistModal({
  isOpen,
  onClose,
  onSuccess,
  onAddOptimistic,
  savingsGoals = [],
}: AddWishlistModalProps) {
  const [mounted, setMounted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Стейт форми нового бажання
  const [title, setTitle] = useState("");
  const [estimatedPrice, setEstimatedPrice] = useState("");
  const [targetPrice, setTargetPrice] = useState("");
  const [currency, setCurrency] = useState("UAH");
  const [categoryName, setCategoryName] = useState("Гаджети");
  const [url, setUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [coolingDays, setCoolingDays] = useState(14);
  const [isCustomDate, setIsCustomDate] = useState(false);
  const [customEndDate, setCustomEndDate] = useState("");
  const [selectedGoalId, setSelectedGoalId] = useState<string>("");
  const [autoCreateGoal, setAutoCreateGoal] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!isOpen || !mounted) return null;

  const handleCreateWish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !estimatedPrice || isSubmitting) return;

    let computedDays = coolingDays;
    let computedEndDate: string | undefined = undefined;

    if (isCustomDate && customEndDate) {
      const targetTime = new Date(customEndDate).getTime();
      const nowTime = Date.now();
      computedDays = Math.max(1, Math.ceil((targetTime - nowTime) / 86400000));
      computedEndDate = new Date(customEndDate).toISOString();
    }

    const priceNum = parseFloat(estimatedPrice);
    const targetPriceNum = targetPrice ? parseFloat(targetPrice) : null;

    let goalIdToLink: number | null = selectedGoalId
      ? parseInt(selectedGoalId, 10)
      : null;

    // Якщо обрано створення нової цілі в Скарбничці
    if (autoCreateGoal) {
      try {
        const goalRes = await fetch("/api/savings-goals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: `Ціль: ${title.trim()}`,
            target_amount: targetPriceNum || priceNum,
            current_amount: 0,
            currency,
            target_date: computedEndDate ? computedEndDate.split("T")[0] : null,
          }),
        });
        if (goalRes.ok) {
          const goalData = await goalRes.json();
          if (goalData?.goal?.id) {
            goalIdToLink = goalData.goal.id;
          }
        }
      } catch (gErr) {
        console.warn("Could not auto-create savings goal:", gErr);
      }
    }

    const payload = {
      title: title.trim(),
      estimated_price: priceNum,
      initial_price: priceNum,
      target_price: targetPriceNum,
      currency,
      category_name: categoryName || "Інше",
      url: url.trim() || null,
      notes: notes.trim() || null,
      cooling_days: computedDays,
      cooling_end_date: computedEndDate,
      savings_goal_id: goalIdToLink,
    };

    onAddOptimistic?.(payload);
    setTitle("");
    setEstimatedPrice("");
    setTargetPrice("");
    setUrl("");
    setNotes("");
    setCoolingDays(14);
    setIsCustomDate(false);
    setCustomEndDate("");
    setSelectedGoalId("");
    setAutoCreateGoal(false);
    onClose();

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/wishlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error("Помилка додавання бажання");

      await onSuccess();
    } catch (err) {
      console.error(err);
      await onSuccess();
    } finally {
      setIsSubmitting(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />

      <div className="relative z-10 flex max-h-[92dvh] min-h-0 w-full max-w-lg flex-col overscroll-contain rounded-t-[28px] border border-slate-800 bg-slate-900 shadow-2xl duration-200 sm:max-h-[85vh] sm:rounded-2xl">
        {/* Mobile handle indicator */}
        <div className="mx-auto mt-3 h-1.5 w-11 shrink-0 rounded-full bg-slate-700/50 sm:hidden" />

        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3.5 sm:px-6 sm:py-4">
          <h3 className="flex items-center gap-2 text-base font-semibold text-slate-100">
            <Clock className="h-5 w-5 text-violet-400" />
            Нове бажання & Трекер ціни
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form
          onSubmit={handleCreateWish}
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <div className="flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">
                Що хочеться купити? *
              </label>
              <input
                type="text"
                required
                placeholder="напр. MacBook Pro 16 M4 Max"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-xl border border-slate-700/60 bg-slate-800/50 px-3.5 py-2.5 text-base text-slate-100 placeholder-slate-500 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 focus:outline-none sm:text-sm"
              />
            </div>

            {/* Посилання на товар */}
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">
                Посилання на товар (опціонально)
              </label>
              <input
                type="url"
                placeholder="https://rozetka.com.ua/... або stylus.ua/..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="w-full rounded-xl border border-slate-700/60 bg-slate-800/50 px-3.5 py-2 text-base text-slate-100 placeholder-slate-500 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 focus:outline-none sm:text-xs"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="mb-1 block text-xs font-medium text-slate-300">
                  Поточна ціна *
                </label>
                <input
                  type="number"
                  step="any"
                  required
                  placeholder="0.00"
                  value={estimatedPrice}
                  onChange={(e) => setEstimatedPrice(e.target.value)}
                  className="w-full rounded-xl border border-slate-700/60 bg-slate-800/50 px-3.5 py-2.5 text-base text-slate-100 placeholder-slate-500 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 focus:outline-none sm:text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-300">
                  Валюта
                </label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="w-full rounded-xl border border-slate-700/60 bg-slate-800/50 px-3 py-2.5 text-base text-slate-100 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 focus:outline-none sm:text-sm"
                >
                  <option value="UAH">UAH ₴</option>
                  <option value="USD">USD $</option>
                  <option value="EUR">EUR €</option>
                  <option value="PLN">PLN zł</option>
                </select>
              </div>
            </div>

            {/* Цільова ціна для покупки (Target Price) */}
            <div>
              <label className="mb-1 block text-xs font-medium text-amber-300">
                Бажана цільова ціна покупки (Target Price, опціонально)
              </label>
              <input
                type="number"
                step="any"
                placeholder="напр. купити, якщо ціна впаде до..."
                value={targetPrice}
                onChange={(e) => setTargetPrice(e.target.value)}
                className="w-full rounded-xl border border-amber-500/30 bg-amber-500/5 px-3.5 py-2 text-base text-slate-100 placeholder-amber-500/40 focus:border-amber-400 focus:ring-1 focus:ring-amber-400 focus:outline-none sm:text-xs"
              />
              <p className="mt-1 text-[11px] text-slate-400">
                Додаток сповістить, коли ціна опуститься до цієї позначки або
                нижче.
              </p>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">
                Категорія
              </label>
              <select
                value={categoryName}
                onChange={(e) => setCategoryName(e.target.value)}
                className="w-full rounded-xl border border-slate-700/60 bg-slate-800/50 px-3.5 py-2 text-base text-slate-100 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 focus:outline-none sm:text-xs"
              >
                <option value="Гаджети">Гаджети та техніка</option>
                <option value="Одяг">Одяг та взуття</option>
                <option value="Дім">Дім та затишок</option>
                <option value="Розваги">Розваги та хобі</option>
                <option value="Спорт">Спорт та активність</option>
                <option value="Краса">Догляд та краса</option>
                <option value="Інше">Інше</option>
              </select>
            </div>

            {/* Період охолодження: розширений вибір до 6 місяців */}
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="block text-xs font-medium text-slate-300">
                  Період охолодження / горизонт очікування
                </label>
                <button
                  type="button"
                  onClick={() => setIsCustomDate(!isCustomDate)}
                  className="flex items-center gap-1 text-[11px] text-violet-400 hover:text-violet-300"
                >
                  <Calendar className="h-3 w-3" />
                  {isCustomDate ? "Швидкі пресети" : "Вказати дату"}
                </button>
              </div>

              {!isCustomDate ? (
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { days: 14, label: "14 дн (Імпульс)" },
                    { days: 30, label: "1 міс (30 дн)" },
                    { days: 90, label: "3 міс (90 дн)" },
                    { days: 180, label: "6 міс (180 дн)" },
                  ].map((p) => (
                    <button
                      type="button"
                      key={p.days}
                      onClick={() => setCoolingDays(p.days)}
                      className={`rounded-xl border py-2 text-center text-xs font-medium transition-all ${
                        coolingDays === p.days
                          ? "border-violet-500 bg-violet-600/30 text-violet-200 shadow-md shadow-violet-500/10"
                          : "border-slate-700 bg-slate-800/40 text-slate-400 hover:border-slate-600"
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="space-y-1">
                  <input
                    type="date"
                    min={new Date().toISOString().split("T")[0]}
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    className="w-full rounded-xl border border-violet-500/50 bg-slate-800/60 px-3.5 py-2 text-xs text-slate-100 focus:border-violet-500 focus:outline-none"
                  />
                  <p className="text-[11px] text-slate-400">
                    Оберіть точну дату, до якої відкласти рішення (наприклад,
                    Black Friday або День народження).
                  </p>
                </div>
              )}
            </div>

            {/* Зв'язок зі Скарбничкою */}
            <div className="rounded-xl border border-slate-800 bg-slate-800/30 p-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
                <PiggyBank className="h-4 w-4 text-pink-400" />
                Місток до накопичення
              </div>
              <p className="mt-1 text-[11px] text-slate-400">
                Поки діє період охолодження, ви можете системно відкладати кошти
                на цю покупку.
              </p>

              <div className="mt-2.5 space-y-2">
                {savingsGoals.length > 0 && !autoCreateGoal && (
                  <div>
                    <label className="mb-1 block text-[11px] text-slate-400">
                      Прив'язати до існуючої скарбнички:
                    </label>
                    <select
                      value={selectedGoalId}
                      onChange={(e) => setSelectedGoalId(e.target.value)}
                      className="w-full rounded-lg border border-slate-700/60 bg-slate-800 px-3 py-1.5 text-xs text-slate-100 focus:border-pink-500 focus:outline-none"
                    >
                      <option value="">Не прив'язувати</option>
                      {savingsGoals.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name} (
                          {Number(g.current_amount).toLocaleString("uk-UA")} /{" "}
                          {Number(g.target_amount || 0).toLocaleString("uk-UA")}{" "}
                          {g.currency})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <label className="flex cursor-pointer items-center gap-2 pt-1 text-xs text-slate-300">
                  <input
                    type="checkbox"
                    checked={autoCreateGoal}
                    onChange={(e) => {
                      setAutoCreateGoal(e.target.checked);
                      if (e.target.checked) setSelectedGoalId("");
                    }}
                    className="h-4 w-4 rounded border-slate-700 bg-slate-800 text-pink-500 focus:ring-0"
                  />
                  <span>
                    Створити нову Скарбничку автоматично під цей товар
                  </span>
                </label>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">
                Чому виникло це бажання? (Емоція / Тригер)
              </label>
              <input
                type="text"
                placeholder="напр. Потрібен для роботи та монтажу 4K відео"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full rounded-xl border border-slate-700/60 bg-slate-800/50 px-3.5 py-2 text-base text-slate-100 placeholder-slate-500 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 focus:outline-none sm:text-xs"
              />
            </div>
          </div>

          <div className="flex shrink-0 items-center justify-end gap-3 border-t border-slate-800 px-5 py-3.5 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:px-6 sm:py-4 sm:pb-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-4 py-2 text-xs font-medium text-slate-400 hover:text-slate-100"
            >
              Скасувати
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2 text-xs font-semibold text-white hover:bg-violet-500 active:scale-95 disabled:opacity-50"
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Clock className="h-4 w-4" />
              )}
              Поставити на трекер
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
