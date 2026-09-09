"use client";

import React, { useRef, useState, useEffect } from "react";
import {
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  Upload,
  ShieldCheck,
} from "lucide-react";

interface InzhurImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function InzhurImportModal({
  isOpen,
  onClose,
  onSuccess,
}: InzhurImportModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
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
    if (!lowerName.endsWith(".xlsx") && !lowerName.endsWith(".xls")) {
      setStatus({
        type: "error",
        text: "Дозволені лише файли звітів із розширенням .xlsx або .xls",
      });
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setIsLoading(true);
    setStatus(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/transactions/import-inzhur", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Помилка завантаження виписки");
      }

      if (data.imported_count === 0 && data.skipped_duplicates > 0) {
        setStatus({
          type: "success",
          text: `Всі ${data.skipped_duplicates} операцій з файлу вже були завантажені раніше (дублікатів не створено).`,
        });
      } else {
        setStatus({
          type: "success",
          text: `Успішно імпортовано ${data.imported_count} нових операцій (${data.skipped_duplicates || 0} дублікатів пропущено).`,
        });
      }

      setTimeout(() => {
        setStatus(null);
        onClose();
        onSuccess?.();
      }, 1800);
    } catch (err: any) {
      console.error(err);
      setStatus({
        type: "error",
        text: err.message || "Не вдалося імпортувати файл. Перевірте формат.",
      });
    } finally {
      setIsLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs">
      <div className="relative w-full max-w-md rounded-3xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl">
        {/* Кнопка закриття */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-zinc-400 hover:text-white"
        >
          <X size={18} />
        </button>

        {/* Заголовок */}
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-400">
            <FileSpreadsheet size={20} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">
              Імпорт виписки Inzhur (.xlsx)
            </h3>
            <p className="text-xs text-zinc-400">
              Рух капіталу, купівля ОВДП/REIT, дивіденди
            </p>
          </div>
        </div>

        {/* Інформаційний бейдж безпеки та ізоляції */}
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-[11px] text-zinc-300">
          <ShieldCheck size={16} className="mt-0.5 shrink-0 text-emerald-400" />
          <div>
            <span className="font-semibold text-emerald-400">
              Ізоляція від щоденних витрат:
            </span>{" "}
            Операції записуються виключно в «Історію операцій капіталу» та не
            впливають на щоденний бюджет чи Burn Rate.
          </div>
        </div>

        {/* Зона завантаження */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 text-center transition-all ${
            isDragOver
              ? "border-emerald-500 bg-emerald-500/10"
              : "border-zinc-800 bg-zinc-900/40 hover:border-zinc-700 hover:bg-zinc-900/70"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx, .xls"
            onChange={handleFileUpload}
            className="hidden"
          />

          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-800 text-zinc-400">
            {isLoading ? (
              <Loader2 size={24} className="animate-spin text-emerald-400" />
            ) : (
              <Upload size={22} className="text-zinc-300" />
            )}
          </div>

          <p className="text-xs font-semibold text-white">
            {isLoading
              ? "Обробка та валідація виписки..."
              : "Оберіть або перетягніть файл .xlsx"}
          </p>
          <p className="mt-1 text-[11px] text-zinc-500">
            Офіційний звіт Inzhur із транзакціями (макс. 5 МБ)
          </p>
        </div>

        {/* Статус-повідомлення */}
        {status && (
          <div
            className={`mt-4 flex items-center gap-2 rounded-xl p-3 text-xs ${
              status.type === "success"
                ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                : "border border-rose-500/30 bg-rose-500/10 text-rose-400"
            }`}
          >
            {status.type === "success" ? (
              <CheckCircle2 size={16} className="shrink-0" />
            ) : (
              <AlertCircle size={16} className="shrink-0" />
            )}
            <span>{status.text}</span>
          </div>
        )}

        {/* Кнопка скасування */}
        <div className="mt-5 flex justify-end">
          <button
            type="button"
            disabled={isLoading}
            onClick={onClose}
            className="rounded-xl border border-zinc-800 px-4 py-2 text-xs font-semibold text-zinc-400 transition-colors hover:bg-zinc-900 hover:text-white disabled:opacity-50"
          >
            Скасувати
          </button>
        </div>
      </div>
    </div>
  );
}
