"use client";

import { useState, useEffect } from "react";
import { Transaction, TransactionReceiptMetadata } from "@/types/finance";
import { triggerHaptic } from "@/lib/haptics";
import { toast } from "sonner";
import {
  extractTagsAndComment,
  formatInitialCommentAndTags,
  removeTagFromText,
} from "@/lib/tag-utils";
import { ActionSheetHeader } from "@/components/transaction-action-sheet/ActionSheetHeader";
import { ActionSheetMerchantSection } from "@/components/transaction-action-sheet/ActionSheetMerchantSection";
import { ActionSheetCategoryPicker } from "@/components/transaction-action-sheet/ActionSheetCategoryPicker";
import { ActionSheetAmortizationSection } from "@/components/transaction-action-sheet/ActionSheetAmortizationSection";
import { ActionSheetCommentSection } from "@/components/transaction-action-sheet/ActionSheetCommentSection";
import { ActionSheetReceiptSection } from "@/components/transaction-action-sheet/ActionSheetReceiptSection";
import { ActionSheetFooterActions } from "@/components/transaction-action-sheet/ActionSheetFooterActions";

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
      <div className="relative z-10 flex max-h-[88vh] min-h-0 w-full max-w-lg flex-col overscroll-contain rounded-t-[28px] border border-zinc-800/80 bg-zinc-950 p-5 pt-3 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl sm:max-h-[90vh] sm:rounded-3xl sm:p-6 sm:pb-6">
        <ActionSheetHeader transaction={transaction} onClose={onClose} />

        {/* Скрол-зона вмісту форми з ізольованим overscroll */}
        <div className="min-h-0 flex-1 [scrollbar-width:thin] space-y-4 overflow-y-auto overscroll-contain pr-1">
          <ActionSheetMerchantSection
            cleanTitleInput={cleanTitleInput}
            onChangeTitle={setCleanTitleInput}
            isTitleModified={isTitleModified}
            onSaveTitle={() => handleSave(selectedCategory)}
            isSubmitting={isSubmitting}
            saveAsRule={saveAsRule}
            onToggleSaveAsRule={setSaveAsRule}
          />

          <ActionSheetAmortizationSection
            amount={Number(transaction.amount)}
            isEmergency={isEmergency}
            onToggleEmergency={setIsEmergency}
            amortizationMonths={amortizationMonths}
            onChangeAmortization={setAmortizationMonths}
          />

          <ActionSheetCategoryPicker
            selectedCategory={selectedCategory}
            onSelectCategory={handleCategorySelect}
            isSubmitting={isSubmitting}
          />

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

          <ActionSheetReceiptSection
            transactionId={transaction.id}
            currentReceipt={currentReceipt}
            onReceiptChange={setCurrentReceipt}
            onReceiptUpdated={onReceiptUpdated}
          />

          <ActionSheetFooterActions
            isDirty={isDirty}
            isSubmitting={isSubmitting}
            onSave={() => handleSave(selectedCategory)}
            canSplit={Boolean(
              onOpenSplit && !transaction.parent_transaction_id
            )}
            onSplit={() => {
              onOpenSplit?.(transaction);
              onClose();
            }}
            isConfirmingDelete={isConfirmingDelete}
            onConfirmDeleteChange={setIsConfirmingDelete}
            onDelete={() => onDelete(transaction.id)}
          />
        </div>
      </div>
    </div>
  );
}
