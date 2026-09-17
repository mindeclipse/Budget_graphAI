"use client";

import { useRef, useState } from "react";
import {
  FileText,
  FileCheck,
  ExternalLink,
  Paperclip,
  Trash2,
  Loader2,
} from "lucide-react";
import { TransactionReceiptMetadata } from "@/types/finance";
import { triggerHaptic } from "@/lib/haptics";
import { toast } from "sonner";

interface ActionSheetReceiptSectionProps {
  transactionId: number;
  currentReceipt: TransactionReceiptMetadata | null;
  onReceiptChange: (receipt: TransactionReceiptMetadata | null) => void;
  onReceiptUpdated?: () => void;
}

function formatFileSize(bytes?: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

export function ActionSheetReceiptSection({
  transactionId,
  currentReceipt,
  onReceiptChange,
  onReceiptUpdated,
}: ActionSheetReceiptSectionProps) {
  const [isAttachingReceipt, setIsAttachingReceipt] = useState(false);
  const receiptFileInputRef = useRef<HTMLInputElement>(null);

  const handleViewReceipt = () => {
    try {
      if (!currentReceipt?.base64) {
        toast.error("Вміст квитанції відсутній");
        return;
      }
      const byteCharacters = atob(currentReceipt.base64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], {
        type: currentReceipt.mimeType || "application/pdf",
      });
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, "_blank");
    } catch (err: any) {
      console.error("Помилка відкриття квитанції:", err);
      toast.error("Не вдалося відкрити квитанцію");
    }
  };

  const handleFileInputChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file || !transactionId) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error("Розмір файлу перевищує 5 МБ");
      if (receiptFileInputRef.current) receiptFileInputRef.current.value = "";
      return;
    }

    if (!file.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Дозволені лише PDF-файли");
      if (receiptFileInputRef.current) receiptFileInputRef.current.value = "";
      return;
    }

    try {
      setIsAttachingReceipt(true);
      const arrayBuffer = await file.arrayBuffer();
      const uint8 = new Uint8Array(arrayBuffer);
      const isPdf =
        uint8.length >= 4 &&
        uint8[0] === 0x25 &&
        uint8[1] === 0x50 &&
        uint8[2] === 0x44 &&
        uint8[3] === 0x46;

      if (!isPdf) {
        toast.error("Вміст файлу не є дійсним PDF");
        return;
      }

      let binary = "";
      const bytes = new Uint8Array(arrayBuffer);
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64 = btoa(binary);

      const receiptPayload: TransactionReceiptMetadata = {
        fileName: file.name,
        fileSize: file.size,
        mimeType: "application/pdf",
        base64,
        attachedAt: new Date().toISOString(),
      };

      const res = await fetch("/api/transactions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: transactionId,
          metadata: {
            receipt: receiptPayload,
          },
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Не вдалося прикріпити квитанцію");
      }

      onReceiptChange(receiptPayload);
      triggerHaptic("success");
      toast.success("Квитанцію успішно прикріплено!");
      onReceiptUpdated?.();
    } catch (err: any) {
      triggerHaptic("error");
      toast.error(err.message || "Помилка прикріплення файлу");
    } finally {
      setIsAttachingReceipt(false);
      if (receiptFileInputRef.current) receiptFileInputRef.current.value = "";
    }
  };

  const handleDeleteReceipt = async () => {
    if (!transactionId) return;
    try {
      setIsAttachingReceipt(true);
      const res = await fetch("/api/transactions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: transactionId,
          metadata: {
            receipt: null,
          },
        }),
      });
      if (!res.ok) throw new Error("Не вдалося видалити квитанцію");
      onReceiptChange(null);
      triggerHaptic("selection");
      toast.success("Квитанцію видалено");
      onReceiptUpdated?.();
    } catch (err: any) {
      toast.error(err.message || "Помилка");
    } finally {
      setIsAttachingReceipt(false);
    }
  };

  return (
    <div className="border-t border-zinc-800/80 pt-4">
      <div className="mb-2 flex items-center justify-between">
        <label className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-zinc-400 uppercase">
          <FileText size={12} className="text-zinc-500" /> Квитанція / Чек
        </label>
        {currentReceipt?.fileSize && (
          <span className="text-[10px] text-zinc-500">
            {formatFileSize(currentReceipt.fileSize)}
          </span>
        )}
      </div>

      {currentReceipt ? (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-3.5 transition-all">
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-400">
                <FileCheck size={18} />
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-white">
                  {currentReceipt.fileName || "Квитанція.pdf"}
                </p>
                <p className="text-[10px] text-zinc-400">
                  {currentReceipt.bankName
                    ? `${currentReceipt.bankName} • `
                    : ""}
                  {currentReceipt.mimeType?.startsWith("image/")
                    ? "Оригінал чека збережено"
                    : "Оригінал PDF збережено"}
                </p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={handleViewReceipt}
                className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-all hover:bg-emerald-500 active:scale-95"
                title="Відкрити квитанцію / чек"
              >
                <ExternalLink size={13} />
                <span>Відкрити</span>
              </button>
              <button
                type="button"
                onClick={handleDeleteReceipt}
                disabled={isAttachingReceipt}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-rose-500/20 hover:text-rose-400"
                title="Видалити квитанцію"
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>

          {currentReceipt.purpose && (
            <p className="mt-2.5 line-clamp-2 rounded-lg bg-zinc-950/40 p-2 text-[10px] leading-relaxed text-zinc-400">
              {currentReceipt.purpose}
            </p>
          )}
        </div>
      ) : (
        <div>
          <input
            ref={receiptFileInputRef}
            type="file"
            accept=".pdf,application/pdf"
            className="hidden"
            onChange={handleFileInputChange}
            disabled={isAttachingReceipt}
          />
          <button
            type="button"
            onClick={() => receiptFileInputRef.current?.click()}
            disabled={isAttachingReceipt}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-800 bg-zinc-900/30 py-2.5 text-xs font-medium text-zinc-300 transition-all hover:border-zinc-700 hover:bg-zinc-900/60 active:scale-[0.99]"
          >
            {isAttachingReceipt ? (
              <>
                <Loader2 size={14} className="animate-spin text-emerald-400" />
                <span>Прикріплення квитанції...</span>
              </>
            ) : (
              <>
                <Paperclip size={14} className="text-zinc-500" />
                <span>Прикріпити квитанцію (PDF)</span>
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
