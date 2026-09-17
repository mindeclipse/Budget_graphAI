"use client";

import { useState, useEffect } from "react";
import {
  X,
  Trash2,
  Store,
  BookmarkCheck,
  Check,
  Loader2,
  Split,
} from "lucide-react";
import { Transaction, TransactionReceiptMetadata } from "@/types/finance";
import { triggerHaptic } from "@/lib/haptics";
import { toast } from "sonner";
import {
  extractTagsAndComment,
  formatInitialCommentAndTags,
  removeTagFromText,
} from "@/lib/tag-utils";
import { ActionSheetCategoryPicker } from "@/components/transaction-action-sheet/ActionSheetCategoryPicker";
import { ActionSheetAmortizationSection } from "@/components/transaction-action-sheet/ActionSheetAmortizationSection";
import { ActionSheetCommentSection } from "@/components/transaction-action-sheet/ActionSheetCommentSection";
import { ActionSheetReceiptSection } from "@/components/transaction-action-sheet/ActionSheetReceiptSection";

export interface TransactionActionSheetProps {
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
  onReceiptUpdated?: () => void;
  onUpdateTransaction?: (payload: {
    id: number;
    category_name?: string;
    clean_title?: string;
    merchant_raw?: string;
    tags?: string[];
    save_as_rule?: boolean;
    exclude_from_budget?: boolean;
    metadata?: Record<string, any>;
  }) => void | Promise<void>;
}

export function TransactionActionSheet({
  transaction,
  onClose,
  onUpdateCategory,
  onUpdateTags,
  onDelete,
  onOpenSplit,
  onOpenTagProject,
  onReceiptUpdated,
  onUpdateTransaction,
}: TransactionActionSheetProps) {
  const [cleanTitleInput, setCleanTitleInput] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [saveAsRule, setSaveAsRule] = useState(true);
  const [commentInput, setCommentInput] = useState("");
  const [initialCommentFormatted, setInitialCommentFormatted] = useState("");
  const [currentTags, setCurrentTags] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  // Стан форс-мажору (подушка) та амортизації
  const [isEmergency, setIsEmergency] = useState(false);
  const [initialIsEmergency, setInitialIsEmergency] = useState(false);
  const [amortizationMonths, setAmortizationMonths] = useState(1);
  const [initialAmortizationMonths, setInitialAmortizationMonths] = useState(1);

  // Стан прикріпленої квитанції
  const [currentReceipt, setCurrentReceipt] =
    useState<TransactionReceiptMetadata | null>(null);

  useEffect(() => {
    if (transaction) {
      setCleanTitleInput(transaction.merchant_raw || "");
      setSelectedCategory(transaction.category_name || "");
      setCurrentTags(transaction.tags || []);
      setSaveAsRule(true);
      setIsConfirmingDelete(false);
      setCurrentReceipt(
        (transaction.metadata?.receipt as TransactionReceiptMetadata) || null
      );

      const existingComment =
        transaction.metadata?.comment || transaction.metadata?.note || "";
      const formatted = formatInitialCommentAndTags(
        existingComment,
        transaction.tags
      );
      setCommentInput(formatted);
      setInitialCommentFormatted(formatted);

      const emergencyInit = Boolean(
        transaction.exclude_from_budget ||
        transaction.metadata?.is_emergency ||
        (Array.isArray(transaction.tags) &&
          transaction.tags.includes("форсмажор"))
      );
      setIsEmergency(emergencyInit);
      setInitialIsEmergency(emergencyInit);

      const amortInit = Number(transaction.metadata?.amortization?.months) || 1;
      setAmortizationMonths(amortInit);
      setInitialAmortizationMonths(amortInit);
    }
  }, [transaction]);

  if (!transaction) return null;

  const isTitleModified =
    cleanTitleInput.trim() !== "" &&
    cleanTitleInput.trim() !== transaction.merchant_raw;

  const isEmergencyModified = isEmergency !== initialIsEmergency;
  const isAmortizationModified =
    amortizationMonths !== initialAmortizationMonths;
  const isCommentModified =
    commentInput.trim() !== initialCommentFormatted.trim();
  const isDirty =
    isTitleModified ||
    isEmergencyModified ||
    isAmortizationModified ||
    isCommentModified;

  const handleSave = async (targetCategory: string = selectedCategory) => {
    if (!transaction || isSubmitting) return;

    setIsSubmitting(true);
    try {
      triggerHaptic("success");

      const existingMetadata = transaction.metadata || {};
      const newMetadata: Record<string, any> = { ...existingMetadata };

      if (isEmergency) {
        newMetadata.is_emergency = true;
        delete newMetadata.amortization;
      } else {
        delete newMetadata.is_emergency;
        if (amortizationMonths > 1) {
          const monthlyAmount = Math.round(
            Number(transaction.amount || 0) / amortizationMonths
          );
          newMetadata.amortization = {
            months: amortizationMonths,
            monthly_amount: monthlyAmount,
            start_date: transaction.created_at,
          };
        } else {
          delete newMetadata.amortization;
        }
      }

      const parsed = extractTagsAndComment(commentInput);
      let updatedTags = [...parsed.tags];
      if (isEmergency && !updatedTags.includes("форсмажор")) {
        updatedTags.push("форсмажор");
      } else if (!isEmergency && updatedTags.includes("форсмажор")) {
        updatedTags = updatedTags.filter((t) => t !== "форсмажор");
      }

      if (parsed.comment) {
        newMetadata.comment = parsed.comment;
        newMetadata.note = parsed.comment;
      } else {
        newMetadata.comment = null;
        newMetadata.note = null;
      }

      if (onUpdateTransaction) {
        await onUpdateTransaction({
          id: transaction.id,
          category_name: targetCategory,
          clean_title: cleanTitleInput.trim() || transaction.merchant_raw,
          merchant_raw: transaction.merchant_raw,
          save_as_rule: saveAsRule,
          tags: updatedTags,
          exclude_from_budget: false,
          metadata: newMetadata,
        });
      } else {
        await fetch("/api/transactions", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: transaction.id,
            category_name: targetCategory,
            clean_title: cleanTitleInput.trim() || transaction.merchant_raw,
            merchant_raw: transaction.merchant_raw,
            save_as_rule: saveAsRule,
            tags: updatedTags,
            exclude_from_budget: false,
            metadata: newMetadata,
          }),
        });
        await onUpdateCategory(
          transaction.id,
          targetCategory,
          cleanTitleInput.trim() || transaction.merchant_raw,
          saveAsRule
        );
        if (onReceiptUpdated) {
          onReceiptUpdated();
        }
      }
      toast.success("Зміни збережено!");
      onClose();
    } catch (err) {
      triggerHaptic("error");
      console.error("Не вдалося оновити транзакцію:", err);
      toast.error("Помилка збереження змін");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCommentChange = (text: string) => {
    setCommentInput(text);
    const parsed = extractTagsAndComment(text);
    let newTags = [...parsed.tags];
    if (isEmergency && !newTags.includes("форсмажор")) {
      newTags.push("форсмажор");
    }
    setCurrentTags(newTags);
  };

  const handleRemoveTag = (tagToRemove: string) => {
    triggerHaptic("selection");
    if (tagToRemove === "форсмажор") {
      setIsEmergency(false);
    }
    const updated = removeTagFromText(commentInput, tagToRemove);
    setCommentInput(updated);
    const parsed = extractTagsAndComment(updated);
    let newTags = [...parsed.tags];
    if (
      isEmergency &&
      tagToRemove !== "форсмажор" &&
      !newTags.includes("форсмажор")
    ) {
      newTags.push("форсмажор");
    }
    setCurrentTags(newTags);
  };

  const handleCategorySelect = (catName: string) => {
    setSelectedCategory(catName);
    handleSave(catName);
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

          {/* Форс-мажор та амортизація */}
          <ActionSheetAmortizationSection
            amount={Number(transaction.amount)}
            isEmergency={isEmergency}
            onToggleEmergency={setIsEmergency}
            amortizationMonths={amortizationMonths}
            onChangeAmortization={setAmortizationMonths}
          />

          {/* Вибір категорії */}
          <ActionSheetCategoryPicker
            selectedCategory={selectedCategory}
            onSelectCategory={handleCategorySelect}
            isSubmitting={isSubmitting}
          />

          {/* Коментар та теги */}
          <ActionSheetCommentSection
            commentInput={commentInput}
            currentTags={currentTags}
            onChangeComment={handleCommentChange}
            onRemoveTag={handleRemoveTag}
            onOpenTagProject={(tag) => {
              onClose();
              onOpenTagProject?.(tag);
            }}
          />

          {/* Блок квитанції / чека */}
          <ActionSheetReceiptSection
            transactionId={transaction.id}
            currentReceipt={currentReceipt}
            onReceiptChange={setCurrentReceipt}
            onReceiptUpdated={onReceiptUpdated}
          />

          {/* Кнопка збереження змін форми (якщо змінено назву, форс-мажор, амортизацію або коментар) */}
          {isDirty && (
            <div className="pt-2">
              <button
                type="button"
                onClick={() => handleSave(selectedCategory)}
                disabled={isSubmitting}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-sky-600 py-3 text-xs font-bold text-white shadow-lg shadow-sky-950/40 transition-all hover:bg-sky-500 active:scale-[0.98] disabled:opacity-50"
              >
                {isSubmitting ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Check size={16} />
                )}
                Зберегти зміни
              </button>
            </div>
          )}

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
