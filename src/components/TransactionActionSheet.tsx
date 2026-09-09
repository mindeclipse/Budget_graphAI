"use client";

import { useState, useEffect } from "react";
import {
  X,
  Trash2,
  Tag as TagIcon,
  Plus,
  Store,
  BookmarkCheck,
  Check,
  Loader2,
  Split,
} from "lucide-react";
import { Transaction } from "@/types/finance";
import { triggerHaptic } from "@/lib/haptics";
import {
  CATEGORIES,
  CATEGORY_ICONS,
  CATEGORY_COLORS,
} from "@/constants/categories";

interface TransactionActionSheetProps {
  transaction: Transaction | null;
  onClose: () => void;
  onUpdateCategory: (
    txId: number,
    newCategory: string,
    cleanTitle?: string,
    saveAsRule?: boolean
  ) => void | Promise<void>;
  onUpdateTags: (txId: number, newTags: string[]) => void | Promise<void>;
  onDelete: (txId: number) => void | Promise<void>;
  onOpenSplit?: (tx: Transaction) => void;
  onOpenTagProject?: (tag: string) => void;
}

export function TransactionActionSheet({
  transaction,
  onClose,
  onUpdateCategory,
  onUpdateTags,
  onDelete,
  onOpenSplit,
  onOpenTagProject,
}: TransactionActionSheetProps) {
  const [cleanTitleInput, setCleanTitleInput] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [saveAsRule, setSaveAsRule] = useState(true);
  const [tagInput, setTagInput] = useState("");
  const [currentTags, setCurrentTags] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  useEffect(() => {
    if (transaction) {
      setCleanTitleInput(transaction.merchant_raw || "");
      setSelectedCategory(transaction.category_name || "");
      setCurrentTags(transaction.tags || []);
      setSaveAsRule(true);
      setIsConfirmingDelete(false);
    }
    setTagInput("");
  }, [transaction]);

  if (!transaction) return null;

  const isTitleModified =
    cleanTitleInput.trim() !== "" &&
    cleanTitleInput.trim() !== transaction.merchant_raw;

  const handleSave = async (targetCategory: string = selectedCategory) => {
    if (!transaction || isSubmitting) return;

    setIsSubmitting(true);
    try {
      triggerHaptic("success");
      await onUpdateCategory(
        transaction.id,
        targetCategory,
        cleanTitleInput.trim() || transaction.merchant_raw,
        saveAsRule
      );
      onClose();
    } catch (err) {
      triggerHaptic("error");
      console.error("Не вдалося оновити транзакцію:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddTag = async () => {
    const cleanTag = tagInput
      .trim()
      .replace(/^#/, "")
      .replace(/[^a-zA-Z0-9а-яА-Яіїєґ_\-]/g, "")
      .toLowerCase()
      .slice(0, 30);
    if (!cleanTag || currentTags.includes(cleanTag) || currentTags.length >= 30)
      return;

    triggerHaptic("selection");
    const updated = [...currentTags, cleanTag];
    setCurrentTags(updated);
    setTagInput("");
    await onUpdateTags(transaction.id, updated);
  };

  const handleRemoveTag = async (tagToRemove: string) => {
    triggerHaptic("selection");
    const updated = currentTags.filter((t) => t !== tagToRemove);
    setCurrentTags(updated);
    await onUpdateTags(transaction.id, updated);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      {/* Клік по підкладці закриває шторку */}
      <div className="fixed inset-0" onClick={onClose} />

      {/* Шторка (Bottom Sheet) для iPhone / Центрована картка для десктопу */}
      <div className="relative z-10 flex max-h-[88vh] w-full max-w-lg flex-col overscroll-contain rounded-t-[28px] border border-zinc-800/80 bg-zinc-950 p-5 pt-3 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl sm:max-h-[90vh] sm:rounded-3xl sm:p-6 sm:pb-6">
        {/* Grabber Bar — маркер свайпу для iOS */}
        <div className="mx-auto mb-3.5 h-1.5 w-11 shrink-0 rounded-full bg-zinc-700/50 sm:hidden" />

        {/* Шапка модалки */}
        <div className="mb-4 flex items-start justify-between border-b border-zinc-800/80 pb-3.5">
          <div className="min-w-0 pr-2">
            <span className="text-[10px] font-semibold tracking-wider text-zinc-500 uppercase">
              Редагування чека
            </span>
            <h3 className="truncate text-base font-bold text-white">
              {transaction.merchant_raw}
            </h3>
            <p className="mt-0.5 text-xs text-zinc-400">
              {new Date(transaction.created_at).toLocaleString("uk-UA")} •{" "}
              <strong className="font-mono font-semibold text-emerald-400 tabular-nums">
                {Number(transaction.amount).toFixed(2)} ₴
              </strong>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-zinc-800/80 bg-zinc-900/60 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white active:scale-95"
          >
            <X size={16} />
          </button>
        </div>

        {/* Скрол-зона вмісту форми з ізольованим overscroll */}
        <div className="[scrollbar-width:thin] space-y-4 overflow-y-auto overscroll-contain pr-1">
          {/* Поле редагування назви закладу */}
          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-zinc-400 uppercase">
              <Store size={12} className="text-zinc-500" /> Назва мерчанта
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={cleanTitleInput}
                onChange={(e) => setCleanTitleInput(e.target.value)}
                placeholder="Введіть зрозумілу назву..."
                className="w-full rounded-xl border border-zinc-800 bg-zinc-900/80 px-3.5 py-2.5 text-base text-white placeholder-zinc-600 transition-colors focus:border-zinc-600 focus:outline-none sm:text-xs"
              />
              {isTitleModified && (
                <button
                  type="button"
                  onClick={() => handleSave(selectedCategory)}
                  disabled={isSubmitting}
                  className="flex shrink-0 items-center gap-1.5 rounded-xl bg-sky-600 px-3.5 py-2.5 text-xs font-semibold text-white transition-all hover:bg-sky-500 active:scale-95 disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <Check size={13} />
                  )}
                  Зберегти
                </button>
              )}
            </div>
          </div>

          {/* Чекбокс запам'ятовування правила */}
          <div>
            <label className="hover:border-zinc-750 flex cursor-pointer items-start gap-3 rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-3 transition-colors">
              <input
                type="checkbox"
                checked={saveAsRule}
                onChange={(e) => setSaveAsRule(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-zinc-700 bg-zinc-800 text-sky-500 focus:ring-0 focus:ring-offset-0"
              />
              <div className="text-xs">
                <div className="flex items-center gap-1.5 font-medium text-zinc-200">
                  <BookmarkCheck size={13} className="text-sky-400" />
                  Запам'ятати для майбутніх покупок
                </div>
                <p className="mt-0.5 text-[11px] leading-relaxed text-zinc-500">
                  Усі наступні списання від цього продавця отримуватимуть цю
                  назву та категорію.
                </p>
              </div>
            </label>
          </div>

          {/* Вибір категорії */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-[11px] font-semibold tracking-wider text-zinc-400 uppercase">
                Категорія (натисніть для вибору)
              </label>
              {isSubmitting && (
                <span className="flex items-center gap-1 text-[11px] text-zinc-500">
                  <Loader2 size={11} className="animate-spin" /> Збереження...
                </span>
              )}
            </div>

            <div className="grid max-h-48 grid-cols-2 gap-1.5 overflow-y-auto pr-1">
              {CATEGORIES.map((catName) => {
                const Icon = CATEGORY_ICONS[catName];
                const color = CATEGORY_COLORS[catName] || "#71717a";
                const isSelected = selectedCategory === catName;

                return (
                  <button
                    key={catName}
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => {
                      setSelectedCategory(catName);
                      handleSave(catName);
                    }}
                    className={`flex items-center gap-2 rounded-xl border p-2 text-left text-xs transition-all active:scale-[0.98] ${
                      isSelected
                        ? "border-sky-500/50 bg-sky-500/10 font-semibold text-white shadow-xs"
                        : "border-zinc-800/80 bg-zinc-900/40 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
                    }`}
                  >
                    {Icon && (
                      <span
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded"
                        style={{ backgroundColor: `${color}20`, color }}
                      >
                        <Icon size={12} />
                      </span>
                    )}
                    <span className="truncate">{catName}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Керування тегами */}
          <div className="border-t border-zinc-800/80 pt-4">
            <label className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-zinc-400 uppercase">
              <TagIcon size={12} className="text-zinc-500" /> Теги події
            </label>

            <div className="mb-2.5 flex flex-wrap gap-1.5">
              {currentTags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-xs font-medium text-zinc-300"
                >
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenTagProject?.(tag);
                    }}
                    title={`Аналітика проєкту #${tag} за весь час`}
                    className="transition-colors hover:text-sky-400"
                  >
                    #{tag}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemoveTag(tag)}
                    className="text-zinc-500 hover:text-rose-400"
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
              {currentTags.length === 0 && (
                <span className="text-xs text-zinc-600">Тегів немає</span>
              )}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleAddTag();
              }}
              className="flex gap-2"
            >
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                placeholder="Додати тег..."
                className="flex-1 rounded-xl border border-zinc-800 bg-zinc-900 px-3.5 py-2 text-base text-white placeholder-zinc-600 focus:border-zinc-700 focus:outline-none sm:text-xs"
              />
              <button
                type="submit"
                disabled={!tagInput.trim()}
                className="flex items-center gap-1 rounded-xl bg-zinc-800 px-3.5 py-2 text-xs font-semibold text-white transition-all hover:bg-zinc-700 active:scale-95 disabled:opacity-40"
              >
                <Plus size={14} /> Додати
              </button>
            </form>
          </div>

          {/* Розділити транзакцію (якщо це не вже розділена дочірня) */}
          {onOpenSplit && !transaction.parent_transaction_id && (
            <div className="pt-2">
              <button
                type="button"
                onClick={() => {
                  onOpenSplit(transaction);
                  onClose();
                }}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-sky-500/30 bg-sky-500/10 py-2.5 text-xs font-bold text-sky-400 transition-all hover:bg-sky-500/20 active:scale-[0.99]"
              >
                <Split size={14} /> Розділити на кілька категорій
              </button>
            </div>
          )}

          {/* Видалення транзакції із захистом від випадкового натискання */}
          <div className="pt-2">
            {isConfirmingDelete ? (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic("selection");
                    setIsConfirmingDelete(false);
                  }}
                  className="flex-1 rounded-2xl border border-zinc-800 bg-zinc-900/80 py-2.5 text-xs font-semibold text-zinc-400 transition-all hover:bg-zinc-800 active:scale-95"
                >
                  Скасувати
                </button>
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic("heavy");
                    onDelete(transaction.id);
                  }}
                  className="flex-1 items-center justify-center gap-1.5 rounded-2xl bg-rose-600 py-2.5 text-xs font-bold text-white shadow-lg shadow-rose-950/40 transition-all hover:bg-rose-500 active:scale-95"
                >
                  <Trash2 size={14} className="mr-1 inline" />
                  Точно видалити?
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  triggerHaptic("warning");
                  setIsConfirmingDelete(true);
                }}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-rose-900/40 bg-rose-950/20 py-2.5 text-xs font-bold text-rose-400 transition-all hover:bg-rose-900/30 active:scale-[0.99]"
              >
                <Trash2 size={14} /> Видалити транзакцію
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
