"use client";

import React, { useRef, useState } from "react";
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from "lucide-react";

interface CsvImportModalProps {
  onSuccess: () => void;
}

export function CsvImportModal({ onSuccess }: CsvImportModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

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
        setIsOpen(false);
        setStatus(null);
        onSuccess();
      }, 1500);
    } catch (err: any) {
      setStatus({ type: "error", text: err.message });
    } finally {
      setIsLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/60 px-2.5 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white"
        title="Імпорт виписки з банку"
      >
        <Upload size={14} />
        <span className="hidden sm:inline">Імпорт Приват24</span>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-xl">
            <div className="flex items-center justify-between pb-4">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-200">
                <FileSpreadsheet size={16} className="text-zinc-400" />
                Імпорт виписки ПриватБанку
              </h3>
              <button
                onClick={() => setIsOpen(false)}
                className="text-xs text-zinc-500 hover:text-zinc-300"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-zinc-400">
              Підтримуються оригінальні файли <b>.xlsx</b> та <b>.csv</b> прямо
              з Приват24. Дублікати вже внесених операцій відфільтровуються
              автоматично.
            </p>

            <div className="mt-4 flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-800 bg-zinc-900/30 p-6 text-center">
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                className="hidden"
                onChange={handleFileUpload}
                disabled={isLoading}
              />

              {isLoading ? (
                <div className="flex flex-col items-center gap-2">
                  <Loader2
                    size={24}
                    className="animate-spin text-emerald-500"
                  />
                  <span className="text-xs text-zinc-400">
                    Обробка виписки...
                  </span>
                </div>
              ) : (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-500"
                >
                  Обрати XLSX або CSV файл
                </button>
              )}
            </div>

            {status && (
              <div
                className={`mt-4 flex items-center gap-2 rounded-lg p-3 text-xs ${
                  status.type === "success"
                    ? "border border-emerald-900/50 bg-emerald-950/40 text-emerald-300"
                    : "border border-rose-900/50 bg-rose-950/40 text-rose-300"
                }`}
              >
                {status.type === "success" ? (
                  <CheckCircle2 size={16} />
                ) : (
                  <AlertCircle size={16} />
                )}
                <span>{status.text}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
