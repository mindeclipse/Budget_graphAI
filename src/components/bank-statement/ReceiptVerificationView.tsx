"use client";

import React, { useState, useMemo } from "react";
import { AlertTriangle, Sparkles, Loader2, ArrowRight } from "lucide-react";
import { InvestmentAsset } from "@/types/finance";
import { triggerHaptic } from "@/lib/haptics";
import { toast } from "sonner";
import { sortInvestments } from "@/components/dashboard/InvestmentsCard";
import {
  ParsedReceiptData,
  toDateTimeLocalString,
} from "@/components/bank-statement/types";
import { ReceiptTypeSelector } from "./verification/ReceiptTypeSelector";
import { ReceiptDetailsForm } from "./verification/ReceiptDetailsForm";
import { InvestmentLinkSection } from "./verification/InvestmentLinkSection";

interface ReceiptVerificationViewProps {
  parsedReceipt: ParsedReceiptData;
  investments?: InvestmentAsset[];
  onResetFile: () => void;
  onClose: () => void;
  onSuccess?: () => void;
  onInvestmentsChange?: () => void;
}

export function ReceiptVerificationView({
  parsedReceipt,
  investments = [],
  onResetFile,
  onClose,
  onSuccess,
  onInvestmentsChange,
}: ReceiptVerificationViewProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [loadingText, setLoadingText] = useState("Збереження операції...");

  // Поля форми редагування квитанції
  const [editAmount, setEditAmount] = useState<string>(
    String(parsedReceipt.amount || "")
  );
  const [editRecipient, setEditRecipient] = useState<string>(
    parsedReceipt.recipient || ""
  );
  const [editDate, setEditDate] = useState<string>(
    toDateTimeLocalString(parsedReceipt.date)
  );
  const [editType, setEditType] = useState<"expense" | "investment">(
    parsedReceipt.type || "expense"
  );
  const [editCategory, setEditCategory] = useState<string>(
    parsedReceipt.category || "Інше"
  );

  // Співставлення з активом за назвою мерчанта чи призначення
  const initialAssetId = useMemo(() => {
    const lowerRecipient = (parsedReceipt.recipient || "").toLowerCase();
    const lowerPurpose = (parsedReceipt.purpose || "").toLowerCase();
    const matched = investments.find(
      (a) =>
        lowerRecipient.includes(a.asset_name.toLowerCase()) ||
        lowerPurpose.includes(a.asset_name.toLowerCase())
    );
    return matched ? String(matched.id) : "none";
  }, [investments, parsedReceipt.recipient, parsedReceipt.purpose]);

  const [selectedAssetId, setSelectedAssetId] =
    useState<string>(initialAssetId);
  const [updateAssetCostBasis, setUpdateAssetCostBasis] =
    useState<boolean>(true);

  const sortedInvestments = useMemo(
    () => sortInvestments(investments || []),
    [investments]
  );

  const handleSaveReceipt = async () => {
    const amountNum = parseFloat(editAmount.replace(",", "."));
    if (isNaN(amountNum) || amountNum <= 0) {
      toast.error("Введіть коректну суму операції");
      return;
    }

    if (!editRecipient.trim()) {
      toast.error("Введіть отримувача або призначення");
      return;
    }

    setIsLoading(true);
    setLoadingText("Збереження операції...");

    try {
      const txCreatedAt = editDate
        ? new Date(editDate).toISOString()
        : new Date(parsedReceipt.date).toISOString();

      // 1. Створення транзакції з прикріпленими метаданими квитанції
      const txPayload = {
        amount: amountNum,
        currency: parsedReceipt.currency || "UAH",
        merchant_raw: editRecipient.trim(),
        category_name: editCategory,
        source: "bank_receipt_pdf",
        type: editType,
        created_at: txCreatedAt,
        metadata: {
          receipt: {
            fileName: parsedReceipt.fileMeta.fileName,
            fileSize: parsedReceipt.fileMeta.fileSize,
            mimeType: parsedReceipt.fileMeta.mimeType,
            base64: parsedReceipt.fileMeta.base64,
            bankName: parsedReceipt.bankName,
            purpose: parsedReceipt.purpose,
            payer: parsedReceipt.payer,
            attachedAt: new Date().toISOString(),
          },
        },
      };

      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(txPayload),
      });

      const resData = await res.json();
      if (!res.ok) {
        throw new Error(resData.error || "Не вдалося зберегти транзакцію");
      }

      // 2. Якщо обрано тип «інвестиція» та вказано конкретний актив — збільшуємо invested_amount
      if (
        editType === "investment" &&
        selectedAssetId !== "none" &&
        updateAssetCostBasis
      ) {
        const asset = investments.find((a) => String(a.id) === selectedAssetId);
        if (asset) {
          const currentInvested = Number(asset.invested_amount || 0);
          const newInvested = Number((currentInvested + amountNum).toFixed(2));

          const patchRes = await fetch("/api/investments", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: asset.id,
              invested_amount: newInvested,
            }),
          });

          if (patchRes.ok) {
            onInvestmentsChange?.();
          }
        }
      }

      triggerHaptic("success");
      toast.success("Квитанцію успішно збережено в системі!");
      onClose();
      onSuccess?.();
    } catch (err: any) {
      toast.error(err.message || "Помилка при збереженні");
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4 overflow-y-auto pr-1">
      {/* Попередження про дублікат */}
      {parsedReceipt.isPotentialDuplicate && (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-400" />
          <div>
            <span className="font-semibold text-amber-300">
              Увага, знайдено схожу операцію!
            </span>
            <p className="mt-0.5 text-[11px] text-amber-300/80">
              В системі за останні 3 дні вже є транзакція на таку саму суму.
              Перевірте, щоб не додати операцію двічі.
            </p>
          </div>
        </div>
      )}

      {/* Бедж банку та AI */}
      <div className="border-zinc-850 flex items-center justify-between rounded-xl border bg-zinc-900/50 px-3 py-2 text-xs">
        <div className="flex items-center gap-1.5 text-zinc-400">
          <Sparkles size={13} className="text-emerald-400" />
          <span>Розпізнано Gemini 3.5 Flash</span>
        </div>
        {parsedReceipt.bankName && (
          <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 font-medium text-emerald-400">
            {parsedReceipt.bankName}
          </span>
        )}
      </div>

      {/* Перемикач типу операції (Витрата / Інвестиція) */}
      <ReceiptTypeSelector editType={editType} onChangeType={setEditType} />

      {/* Форма деталей: сума, дата, отримувач, категорія, призначення */}
      <ReceiptDetailsForm
        currency={parsedReceipt.currency || "UAH"}
        amount={editAmount}
        onChangeAmount={setEditAmount}
        date={editDate}
        onChangeDate={setEditDate}
        recipient={editRecipient}
        onChangeRecipient={setEditRecipient}
        category={editCategory}
        onChangeCategory={setEditCategory}
        purpose={parsedReceipt.purpose}
      />

      {/* Прив'язка до активу портфеля (коли type === "investment") */}
      {editType === "investment" && (
        <InvestmentLinkSection
          selectedAssetId={selectedAssetId}
          onChangeAssetId={setSelectedAssetId}
          sortedInvestments={sortedInvestments}
          updateAssetCostBasis={updateAssetCostBasis}
          onChangeUpdateCostBasis={setUpdateAssetCostBasis}
          amount={editAmount}
        />
      )}

      {/* Кнопки дій */}
      <div className="flex items-center gap-2 pt-2">
        <button
          type="button"
          onClick={onResetFile}
          className="flex-1 rounded-xl border border-zinc-800 bg-zinc-900/80 py-2.5 text-xs font-semibold text-zinc-300 transition-colors hover:bg-zinc-800 active:scale-95"
          disabled={isLoading}
        >
          Інший файл
        </button>

        <button
          type="button"
          onClick={handleSaveReceipt}
          disabled={isLoading}
          className="flex flex-[2] items-center justify-center gap-2 rounded-xl bg-emerald-600 py-2.5 text-xs font-bold text-white shadow-lg shadow-emerald-950/40 transition-all hover:bg-emerald-500 active:scale-95 disabled:opacity-50"
        >
          {isLoading ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              <span>{loadingText}</span>
            </>
          ) : (
            <>
              <span>Зберегти операцію</span>
              <ArrowRight size={14} />
            </>
          )}
        </button>
      </div>
    </div>
  );
}
