"use client";

import React, { useRef, useState, useEffect } from "react";
import {
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  Upload,
} from "lucide-react";

interface CsvImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function CsvImportModal({
  isOpen,
  onClose,
  onSuccess,
}: CsvImportModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "unset";
    };
  }, [isOpen, onClose]);

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
    if (
      !lowerName.endsWith(".xlsx") &&
      !lowerName.endsWith(".xls") &&
      !lowerName.endsWith(".csv")
    ) {
      setStatus({
        type: "error",
        text: "Дозволені лише файли з розширенням .xlsx, .xls або .csv",
      });
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setIsLoading(true);
    setStatus(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/transactions/import-csv", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Помилка завантаження");
      }

      setStatus({
        type: "success",
        text: `Успішно імпортовано нових операцій: ${data.imported_count} (із ${data.total_rows})`,
      });

      setTimeout(() => {
        setStatus(null);
        onClose();
        onSuccess?.();
      }, 1500);
    } catch (err: any) {
      setStatus({ type: "error", text: err.message });
    } finally {
      setIsLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      {/* Підкладка для закриття кліком */}
      <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />

      {/* Адаптивна шторка для iPhone / Центрована картка для десктопу */}
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-md flex-col overscroll-contain rounded-t-[28px] border border-zinc-800 bg-zinc-950 p-5 pt-3 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl sm:max-h-[85vh] sm:rounded-3xl sm:p-6 sm:pb-6">
        {/* Grabber Bar для iOS */}
        <div className="mx-auto mb-3 h-1.5 w-11 shrink-0 rounded-full bg-zinc-700/50 sm:hidden" />

        {/* Заголовок модалки */}
        <div className="mb-4 flex items-center justify-between border-b border-zinc-800/80 pb-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
              <FileSpreadsheet size={16} />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                Імпорт виписки банку
              </h3>
              <p className="text-[11px] text-zinc-400">
                Підтримуються файли .xlsx, .xls та .csv
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900/60 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white active:scale-95"
          >
            <X size={16} />
          </button>
        </div>

        {/* Тіло модалки */}
        <div className="space-y-4">
          <p className="text-xs leading-relaxed text-zinc-400">
            Виписки вашого банку (ПриватБанк, Монобанк, А-Банк тощо). Дублікати
            вже внесених операцій відфільтровуються автоматично за датою та
            сумою.
          </p>

          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/30 p-6 text-center transition-colors hover:border-zinc-700">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              className="hidden"
              onChange={handleFileUpload}
              disabled={isLoading}
            />

            {isLoading ? (
              <div className="flex flex-col items-center gap-2.5 py-3">
                <Loader2 size={26} className="animate-spin text-emerald-400" />
                <span className="font-mono text-xs text-zinc-400">
                  Обробка виписки...
                </span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <div className="bg-zinc-850 flex h-10 w-10 items-center justify-center rounded-full text-zinc-400">
                  <Upload size={18} />
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-emerald-950/40 transition-all hover:bg-emerald-500 active:scale-95"
                >
                  Обрати XLSX або CSV файл
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
                <CheckCircle2 size={16} className="shrink-0 text-emerald-400" />
              ) : (
                <AlertCircle size={16} className="shrink-0 text-rose-400" />
              )}
              <span className="leading-snug">{status.text}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
