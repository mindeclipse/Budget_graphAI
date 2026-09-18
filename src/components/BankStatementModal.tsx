"use client";

import React, { useRef, useState, useEffect } from "react";
import { FileSpreadsheet, FileText, X } from "lucide-react";
import { InvestmentAsset } from "@/types/finance";
import { triggerHaptic } from "@/lib/haptics";
import {
  ParsedReceiptData,
  formatFileSize,
} from "@/components/bank-statement/types";
import { StatementDropzoneView } from "@/components/bank-statement/StatementDropzoneView";
import { ReceiptVerificationView } from "@/components/bank-statement/ReceiptVerificationView";

export interface BankStatementModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  investments?: InvestmentAsset[];
  initialType?: "expense" | "investment";
  initialFile?: File | null;
  onInvestmentsChange?: () => void;
}

export function BankStatementModal({
  isOpen,
  onClose,
  onSuccess,
  investments = [],
  initialType = "expense",
  initialFile = null,
  onInvestmentsChange,
}: BankStatementModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [loadingText, setLoadingText] = useState("Обробка файлу...");
  const [status, setStatus] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Режим підтвердження квитанції PDF або фото чека
  const [parsedReceipt, setParsedReceipt] = useState<ParsedReceiptData | null>(
    null
  );

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleCloseModal();
    };
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  const handleCloseModal = () => {
    setParsedReceipt(null);
    setStatus(null);
    setIsLoading(false);
    onClose();
  };

  const processFile = async (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      setStatus({
        type: "error",
        text: "Розмір файлу перевищує 5 МБ. Будь ласка, оберіть менший файл.",
      });
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    const lowerName = file.name.toLowerCase();
    const isPdf = lowerName.endsWith(".pdf");
    const isImage =
      lowerName.endsWith(".png") ||
      lowerName.endsWith(".jpg") ||
      lowerName.endsWith(".jpeg") ||
      lowerName.endsWith(".webp") ||
      file.type.startsWith("image/");
    const isExcelOrCsv =
      lowerName.endsWith(".xlsx") ||
      lowerName.endsWith(".xls") ||
      lowerName.endsWith(".csv");

    if (!isPdf && !isImage && !isExcelOrCsv) {
      setStatus({
        type: "error",
        text: "Дозволені лише файли виписок (.xlsx, .xls, .csv) або квитанцій (.pdf, .png, .jpg, .webp)",
      });
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setStatus(null);

    // ── Сценарій 1: Квитанція PDF або фото/скріншот чека (AI-аналіз Gemini) ──────
    if (isPdf || isImage) {
      setIsLoading(true);
      setLoadingText("ШІ аналізує квитанцію (Gemini 3.5)...");

      const formData = new FormData();
      formData.append("file", file);

      try {
        const res = await fetch("/api/transactions/parse-receipt", {
          method: "POST",
          body: formData,
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Не вдалося розпізнати квитанцію");
        }

        const rec = data.receipt;
        const meta = data.fileMeta;

        const receiptData: ParsedReceiptData = {
          amount: rec.amount,
          currency: rec.currency || "UAH",
          recipient: rec.recipient,
          purpose: rec.purpose,
          date: rec.date,
          type: rec.type || initialType,
          category: rec.category || "Інше",
          payer: rec.payer,
          bankName: rec.bankName,
          isPotentialDuplicate: rec.isPotentialDuplicate,
          duplicateTxId: rec.duplicateTxId,
          fileMeta: meta,
        };

        setParsedReceipt(receiptData);
        triggerHaptic("success");
      } catch (err: any) {
        setStatus({ type: "error", text: err.message });
      } finally {
        setIsLoading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
      return;
    }

    // ── Сценарій 2: Виписка банку або звіт Inzhur (.xlsx, .xls, .csv) ──────────────
    setIsLoading(true);
    setLoadingText("Обробка та фільтрація виписки...");

    const formData = new FormData();
    formData.append("file", file);

    try {
      const endpoint =
        initialType === "investment"
          ? "/api/transactions/import-inzhur"
          : "/api/transactions/import-csv";

      let res = await fetch(endpoint, {
        method: "POST",
        body: formData,
      });

      let data = await res.json();

      // Якщо звіт Inzhur не підійшов, автоматичний fallback на стандартну банківську виписку
      if (
        !res.ok &&
        initialType === "investment" &&
        endpoint === "/api/transactions/import-inzhur"
      ) {
        const fallbackRes = await fetch("/api/transactions/import-csv", {
          method: "POST",
          body: formData,
        });
        if (fallbackRes.ok) {
          res = fallbackRes;
          data = await fallbackRes.json();
        }
      }

      if (!res.ok) {
        throw new Error(data.error || "Помилка завантаження виписки");
      }

      triggerHaptic("success");
      setStatus({
        type: "success",
        text: `Успішно імпортовано нових операцій: ${data.imported_count ?? data.count ?? 0} (із ${data.total_rows ?? data.total ?? "?"})`,
      });

      setTimeout(() => {
        setStatus(null);
        handleCloseModal();
        onSuccess?.();
      }, 1500);
    } catch (err: any) {
      setStatus({ type: "error", text: err.message });
    } finally {
      setIsLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  useEffect(() => {
    if (isOpen && initialFile) {
      processFile(initialFile);
    }
  }, [isOpen, initialFile]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      {/* Підкладка для закриття кліком */}
      <div
        className="fixed inset-0"
        onClick={handleCloseModal}
        aria-hidden="true"
      />

      {/* Адаптивна шторка для iPhone / Центрована картка для десктопу */}
      <div className="relative z-10 flex max-h-[92vh] min-h-0 w-full max-w-lg flex-col overscroll-contain rounded-t-[28px] border border-zinc-800 bg-zinc-950 p-5 pt-3 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl sm:max-h-[85vh] sm:rounded-3xl sm:p-6 sm:pb-6">
        {/* Grabber Bar для iOS */}
        <div className="mx-auto mb-3 h-1.5 w-11 shrink-0 rounded-full bg-zinc-700/50 sm:hidden" />

        {/* Заголовок модалки */}
        <div className="mb-4 flex items-center justify-between border-b border-zinc-800/80 pb-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
              {parsedReceipt ? (
                <FileText size={16} />
              ) : (
                <FileSpreadsheet size={16} />
              )}
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                {parsedReceipt
                  ? "Підтвердження квитанції"
                  : "Імпорт виписки або квитанції"}
              </h3>
              <p className="text-[11px] text-zinc-400">
                {parsedReceipt
                  ? `${parsedReceipt.fileMeta.fileName} (${formatFileSize(parsedReceipt.fileMeta.fileSize)})`
                  : "Підтримуються виписки (.xlsx, .xls, .csv) та квитанції чи фото чеків (.pdf, .png, .jpg, .webp)"}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleCloseModal}
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900/60 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white active:scale-95"
          >
            <X size={16} />
          </button>
        </div>

        {/* Тіло модалки: перегляд розпізнаної квитанції або вибір файлу */}
        {parsedReceipt ? (
          <ReceiptVerificationView
            parsedReceipt={parsedReceipt}
            investments={investments}
            onResetFile={() => setParsedReceipt(null)}
            onClose={handleCloseModal}
            onSuccess={onSuccess}
            onInvestmentsChange={onInvestmentsChange}
          />
        ) : (
          <StatementDropzoneView
            initialType={initialType}
            isLoading={isLoading}
            loadingText={loadingText}
            status={status}
            fileInputRef={fileInputRef}
            onFileSelected={handleFileUpload}
          />
        )}
      </div>
    </div>
  );
}

// Зворотна сумісність для попередніх імпортів
export const CsvImportModal = BankStatementModal;
export type CsvImportModalProps = BankStatementModalProps;
