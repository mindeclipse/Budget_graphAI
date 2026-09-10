"use client";

import React, { useRef, useState, useEffect } from "react";
import {
  FileSpreadsheet,
  FileText,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Loader2,
  X,
  Upload,
  TrendingUp,
  Wallet,
  Sparkles,
  ArrowRight,
  Info,
} from "lucide-react";
import { CATEGORIES } from "@/constants/categories";
import { InvestmentAsset } from "@/types/finance";
import { triggerHaptic } from "@/lib/haptics";
import { toast } from "sonner";

export interface BankStatementModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  investments?: InvestmentAsset[];
  initialType?: "expense" | "investment";
  onInvestmentsChange?: () => void;
}

interface ParsedReceiptData {
  amount: number;
  currency: string;
  recipient: string;
  purpose: string;
  date: string;
  type: "expense" | "investment";
  category: string;
  payer?: string;
  bankName?: string;
  isPotentialDuplicate?: boolean;
  duplicateTxId?: number | null;
  fileMeta: {
    fileName: string;
    fileSize: number;
    base64: string;
    mimeType: string;
  };
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

function toDateTimeLocalString(isoOrDateStr: string): string {
  try {
    const d = new Date(isoOrDateStr);
    if (isNaN(d.getTime())) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    const y = d.getFullYear();
    const m = pad(d.getMonth() + 1);
    const day = pad(d.getDate());
    const h = pad(d.getHours());
    const min = pad(d.getMinutes());
    return `${y}-${m}-${day}T${h}:${min}`;
  } catch {
    return "";
  }
}

export function BankStatementModal({
  isOpen,
  onClose,
  onSuccess,
  investments = [],
  initialType = "expense",
  onInvestmentsChange,
}: BankStatementModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [loadingText, setLoadingText] = useState("Обробка файлу...");
  const [status, setStatus] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Режим підтвердження квитанції PDF
  const [parsedReceipt, setParsedReceipt] = useState<ParsedReceiptData | null>(
    null
  );

  // Поля форми редагування квитанції
  const [editAmount, setEditAmount] = useState<string>("");
  const [editRecipient, setEditRecipient] = useState<string>("");
  const [editDate, setEditDate] = useState<string>("");
  const [editType, setEditType] = useState<"expense" | "investment">("expense");
  const [editCategory, setEditCategory] = useState<string>("Інше");
  const [selectedAssetId, setSelectedAssetId] = useState<string>("none");
  const [updateAssetCostBasis, setUpdateAssetCostBasis] =
    useState<boolean>(true);

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

  if (!isOpen) return null;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

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
    const isExcelOrCsv =
      lowerName.endsWith(".xlsx") ||
      lowerName.endsWith(".xls") ||
      lowerName.endsWith(".csv");

    if (!isPdf && !isExcelOrCsv) {
      setStatus({
        type: "error",
        text: "Дозволені лише файли виписок (.xlsx, .xls, .csv) або квитанцій (.pdf)",
      });
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setStatus(null);

    // ── Сценарій 1: Квитанція у форматі PDF (AI-аналіз Gemini) ─────────────────────
    if (isPdf) {
      setIsLoading(true);
      setLoadingText("ШІ аналізує банківську квитанцію (Gemini 3.5)...");

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
        setEditAmount(String(receiptData.amount));
        setEditRecipient(receiptData.recipient);
        setEditDate(toDateTimeLocalString(receiptData.date));
        setEditType(receiptData.type);
        setEditCategory(receiptData.category);

        // Якщо тип інвестиція та є актив з подібною назвою (наприклад ОВДП чи Inzhur), пропонуємо його
        const lowerRecipient = receiptData.recipient.toLowerCase();
        const lowerPurpose = (receiptData.purpose || "").toLowerCase();
        const matchedAsset = investments.find(
          (a) =>
            lowerRecipient.includes(a.asset_name.toLowerCase()) ||
            lowerPurpose.includes(a.asset_name.toLowerCase())
        );
        if (matchedAsset) {
          setSelectedAssetId(String(matchedAsset.id));
        } else {
          setSelectedAssetId("none");
        }

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
      // Якщо відкрито з розділу Капіталу або файл містить Inzhur — пробуємо спочатку Inzhur
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

  // Збереження розпізнаної квитанції
  const handleSaveReceipt = async () => {
    if (!parsedReceipt) return;

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
      handleCloseModal();
      onSuccess?.();
    } catch (err: any) {
      toast.error(err.message || "Помилка при збереженні");
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      {/* Підкладка для закриття кліком */}
      <div
        className="fixed inset-0"
        onClick={handleCloseModal}
        aria-hidden="true"
      />

      {/* Адаптивна шторка для iPhone / Центрована картка для десктопу */}
      <div className="relative z-10 flex max-h-[92vh] w-full max-w-lg flex-col overscroll-contain rounded-t-[28px] border border-zinc-800 bg-zinc-950 p-5 pt-3 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl sm:max-h-[85vh] sm:rounded-3xl sm:p-6 sm:pb-6">
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
                  : "Підтримуються виписки (.xlsx, .xls, .csv) та квитанції (.pdf)"}
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

        {/* ── ТІЛО МОДАЛКИ: Перегляд розпізнаної квитанції ───────────────────── */}
        {parsedReceipt ? (
          <div className="space-y-4 overflow-y-auto pr-1">
            {/* Попередження про дублікат */}
            {parsedReceipt.isPotentialDuplicate && (
              <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
                <AlertTriangle
                  size={16}
                  className="mt-0.5 shrink-0 text-amber-400"
                />
                <div>
                  <span className="font-semibold text-amber-300">
                    Увага, знайдено схожу операцію!
                  </span>
                  <p className="mt-0.5 text-[11px] text-amber-300/80">
                    В системі за останні 3 дні вже є транзакція на таку саму
                    суму. Перевірте, щоб не додати операцію двічі.
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
                    {investments.map((asset) => (
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
                        onChange={(e) =>
                          setUpdateAssetCostBasis(e.target.checked)
                        }
                        className="h-4 w-4 rounded border-zinc-700 bg-zinc-800 text-emerald-500 focus:ring-0"
                      />
                      <span>
                        Збільшити собівартість (
                        <code className="text-[11px] text-emerald-400">
                          invested_amount
                        </code>
                        ) на +
                        {parseFloat(editAmount || "0").toLocaleString("uk-UA")}{" "}
                        ₴
                      </span>
                    </label>

                    {/* Нагадування згідно з вимогами користувача */}
                    <div className="flex items-start gap-2 rounded-xl border border-zinc-800/80 bg-zinc-900/60 p-2.5 text-[11px] leading-relaxed text-zinc-400">
                      <Info
                        size={14}
                        className="mt-0.5 shrink-0 text-emerald-400"
                      />
                      <span>
                        Сума збільшить фактично вкладені кошти (собівартість).
                        Поточну ринкову вартість (
                        <code className="text-zinc-300">current_value</code>) ви
                        зможете оновити пізніше через звіт Inzhur або вручну в
                        картці інвестицій.
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
                onClick={() => setParsedReceipt(null)}
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
        ) : (
          /* ── ТІЛО МОДАЛКИ: Вибір файлу ────────────────────────────────────────── */
          <div className="space-y-4">
            <p className="text-xs leading-relaxed text-zinc-400">
              {initialType === "investment"
                ? "Завантажуйте виписки Inzhur (.xlsx) або окремі банківські квитанції (.pdf) поповнення ОВДП та брокерських рахунків."
                : "Виписки вашого банку (.xlsx, .xls, .csv) або поодинокі квитанції переказів (.pdf). Дані зчитуються автоматично, дублікати фільтруються."}
            </p>

            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/30 p-6 text-center transition-colors hover:border-zinc-700">
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                className="hidden"
                onChange={handleFileUpload}
                disabled={isLoading}
              />

              {isLoading ? (
                <div className="flex flex-col items-center gap-2.5 py-4">
                  <Loader2
                    size={28}
                    className="animate-spin text-emerald-400"
                  />
                  <span className="font-mono text-xs text-zinc-300">
                    {loadingText}
                  </span>
                  <span className="text-[11px] text-zinc-500">
                    Зазвичай це займає 2-4 секунди
                  </span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <div className="bg-zinc-850 flex h-11 w-11 items-center justify-center rounded-full border border-zinc-800 text-zinc-400">
                    <Upload size={20} />
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-zinc-200">
                      Перетягніть файл сюди або натисніть для вибору
                    </p>
                    <p className="text-[11px] text-zinc-500">
                      Квитанція PDF чи виписка XLSX / CSV до 5 МБ
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="mt-1 flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-emerald-950/40 transition-all hover:bg-emerald-500 active:scale-95"
                  >
                    Обрати файл з пристрою
                  </button>
                </div>
              )}
            </div>

            {status && (
              <div
                className={`flex items-center gap-2.5 rounded-xl border p-3 text-xs ${
                  status.type === "success"
                    ? "border-emerald-500/30 bg-emerald-500/10 font-mono text-emerald-300 tabular-nums"
                    : "border-rose-500/30 bg-rose-500/10 text-rose-300"
                }`}
              >
                {status.type === "success" ? (
                  <CheckCircle2
                    size={16}
                    className="shrink-0 text-emerald-400"
                  />
                ) : (
                  <AlertCircle size={16} className="shrink-0 text-rose-400" />
                )}
                <span className="leading-snug">{status.text}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Зворотна сумісність для попередніх імпортів
export const CsvImportModal = BankStatementModal;
export type CsvImportModalProps = BankStatementModalProps;
