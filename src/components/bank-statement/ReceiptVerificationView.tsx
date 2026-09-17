"use client";

import React, { useState, useMemo } from "react";
import {
  AlertTriangle,
  Sparkles,
  Wallet,
  TrendingUp,
  Info,
  Loader2,
  ArrowRight,
} from "lucide-react";
import { CATEGORIES } from "@/constants/categories";
import { InvestmentAsset } from "@/types/finance";
import { triggerHaptic } from "@/lib/haptics";
import { toast } from "sonner";
import { sortInvestments } from "@/components/dashboard/InvestmentsCard";
import {
  ParsedReceiptData,
  toDateTimeLocalString,
} from "@/components/bank-statement/types";

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
      <div>
        <label className="mb-1.5 block text-[11px] font-medium text-zinc-400">
          Куди зарахувати операцію?
        </label>
        <div className="grid grid-cols-2 gap-2 rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-1">
          <button
            type="button"
            onClick={() => {
              setEditType("expense");
              triggerHaptic("selection");
            }}
            className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition-all ${
              editType === "expense"
                ? "bg-rose-500/20 text-rose-300 shadow-sm"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            <Wallet size={14} />
            <span>💸 Витрата (бюджет)</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setEditType("investment");
              triggerHaptic("selection");
            }}
            className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition-all ${
              editType === "investment"
                ? "bg-emerald-500/20 text-emerald-300 shadow-sm"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            <TrendingUp size={14} />
            <span>📈 Інвестиція / Капітал</span>
          </button>
        </div>
      </div>

      {/* Сума та Отримувач */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-[11px] font-medium text-zinc-400">
            Сума операції ({parsedReceipt.currency})
          </label>
          <input
            type="text"
            value={editAmount}
            onChange={(e) => setEditAmount(e.target.value)}
            className="w-full rounded-xl border border-zinc-800 bg-zinc-900/70 px-3 py-2 font-mono text-sm font-bold text-white outline-none focus:border-emerald-500/50"
            placeholder="0.00"
          />
        </div>

        <div>
          <label className="mb-1 block text-[11px] font-medium text-zinc-400">
            Дата та час
          </label>
          <input
            type="datetime-local"
            value={editDate}
            onChange={(e) => setEditDate(e.target.value)}
            className="w-full rounded-xl border border-zinc-800 bg-zinc-900/70 px-3 py-2 text-xs text-white outline-none focus:border-emerald-500/50"
          />
        </div>
      </div>

      {/* Отримувач */}
      <div>
        <label className="mb-1 block text-[11px] font-medium text-zinc-400">
          Отримувач / Торговець
        </label>
        <input
          type="text"
          value={editRecipient}
          onChange={(e) => setEditRecipient(e.target.value)}
          className="w-full rounded-xl border border-zinc-800 bg-zinc-900/70 px-3 py-2 text-xs text-white outline-none focus:border-emerald-500/50"
          placeholder="Назва компанії чи ФОП"
        />
      </div>

      {/* Категорія */}
      <div>
        <label className="mb-1 block text-[11px] font-medium text-zinc-400">
          Категорія
        </label>
        <select
          value={editCategory}
          onChange={(e) => setEditCategory(e.target.value)}
          className="w-full rounded-xl border border-zinc-800 bg-zinc-900/70 px-3 py-2 text-xs text-white outline-none focus:border-emerald-500/50"
        >
          {CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>
      </div>

      {/* Призначення платежу */}
      {parsedReceipt.purpose && (
        <div>
          <label className="mb-1 block text-[11px] font-medium text-zinc-400">
            Призначення платежу (з квитанції)
          </label>
          <div className="border-zinc-850 rounded-xl border bg-zinc-900/30 p-2.5 text-[11px] leading-relaxed text-zinc-400">
            {parsedReceipt.purpose}
          </div>
        </div>
      )}

      {/* ── УМОВНИЙ БЛОК: Вибір активу портфеля (ТІЛЬКИ коли type === "investment") ── */}
      {editType === "investment" && (
        <div className="space-y-3 rounded-2xl border border-emerald-500/20 bg-emerald-950/10 p-3.5">
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-300">
            <TrendingUp size={15} className="text-emerald-400" />
            <span>Прив&apos;язка до активу портфеля (опціонально)</span>
          </div>

          <div>
            <label className="mb-1 block text-[11px] text-zinc-400">
              Оберіть випуск ОВДП або інвестиційний актив:
            </label>
            <select
              value={selectedAssetId}
              onChange={(e) => setSelectedAssetId(e.target.value)}
              className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-white outline-none focus:border-emerald-500/50"
            >
              <option value="none">
                Без прив&apos;язки (тільки операція в капіталі)
              </option>
              {sortedInvestments.map((asset) => (
                <option key={asset.id} value={String(asset.id)}>
                  [{asset.asset_type.toUpperCase()}] {asset.asset_name} (
                  {Number(asset.invested_amount).toLocaleString("uk-UA")}{" "}
                  {asset.currency})
                </option>
              ))}
            </select>
          </div>

          {selectedAssetId !== "none" && (
            <div className="space-y-2 border-t border-emerald-500/10 pt-2.5">
              <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-300">
                <input
                  type="checkbox"
                  checked={updateAssetCostBasis}
                  onChange={(e) => setUpdateAssetCostBasis(e.target.checked)}
                  className="h-4 w-4 rounded border-zinc-700 bg-zinc-800 text-emerald-500 focus:ring-0"
                />
                <span>
                  Збільшити собівартість (
                  <code className="text-[11px] text-emerald-400">
                    invested_amount
                  </code>
                  ) на +{parseFloat(editAmount || "0").toLocaleString("uk-UA")}{" "}
                  ₴
                </span>
              </label>

              <div className="flex items-start gap-2 rounded-xl border border-zinc-800/80 bg-zinc-900/60 p-2.5 text-[11px] leading-relaxed text-zinc-400">
                <Info size={14} className="mt-0.5 shrink-0 text-emerald-400" />
                <span>
                  Сума збільшить фактично вкладені кошти (собівартість). Поточну
                  ринкову вартість (
                  <code className="text-zinc-300">current_value</code>) ви
                  зможете оновити пізніше через звіт Inzhur або вручну в картці
                  інвестицій.
                </span>
              </div>
            </div>
          )}
        </div>
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
