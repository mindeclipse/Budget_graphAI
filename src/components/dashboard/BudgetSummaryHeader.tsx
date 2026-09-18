"use client";

import { useState, useRef, memo } from "react";
import { toast } from "sonner";
import { triggerHaptic } from "@/lib/haptics";
import {
  BudgetSummaryHeaderProps,
  HeaderAmountDisplay,
  HeaderMetricsPills,
  SettingsDropdownMenu,
} from "./budget-summary";

export type { BudgetSummaryHeaderProps } from "./budget-summary";

export const BudgetSummaryHeader = memo(function BudgetSummaryHeader({
  spentWhole,
  spentCents,
  recurringTotal,
  transactionCount,
  onOpenNewCycle,
  onOpenImport,
  onRegisterDevice,
  onLogout,
  onExportExcel,
  onRestoreSuccess,
  onOpenTrash,
  onOpenMerchantRules,
}: BudgetSummaryHeaderProps) {
  const [isSendingDigest, setIsSendingDigest] = useState(false);
  const [isSendingBackupTelegram, setIsSendingBackupTelegram] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSendTestDigest = async () => {
    if (isSendingDigest) return;
    setIsSendingDigest(true);
    const toastId = toast.loading("Формування AI-дайджесту...");
    try {
      const res = await fetch("/api/cron/digest?type=weekly&force=true");
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "Помилка відправки");
      }
      if (data.sent) {
        toast.success("AI-дайджест успішно надіслано в Telegram!", {
          id: toastId,
          description: "Перевірте чат вашого бота",
        });
      } else {
        toast.info("Дайджест сформовано, але не відправлено", {
          id: toastId,
          description:
            data.reason ||
            "Перевірте налаштування TELEGRAM_BOT_TOKEN та TELEGRAM_CHAT_ID",
        });
      }
    } catch (err: any) {
      toast.error("Не вдалося надіслати дайджест", {
        id: toastId,
        description: err.message || "Помилка зв'язку із сервером",
      });
    } finally {
      setIsSendingDigest(false);
    }
  };

  const handleSendBackupToTelegram = async () => {
    if (isSendingBackupTelegram) return;
    setIsSendingBackupTelegram(true);
    const toastId = toast.loading(
      "Створення та надсилання бекапу в Telegram..."
    );
    try {
      const res = await fetch("/api/backup/telegram", { method: "POST" });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "Не вдалося надіслати бекап");
      }
      triggerHaptic("success");
      toast.success("Бекап надіслано в Telegram!", {
        id: toastId,
        description: data.fileName,
      });
    } catch (err: any) {
      triggerHaptic("error");
      toast.error("Помилка відправки в Telegram", {
        id: toastId,
        description: err.message,
      });
    } finally {
      setIsSendingBackupTelegram(false);
    }
  };

  const handleDownloadBackup = async () => {
    const toastId = toast.loading("Створення резервної копії...");
    try {
      const res = await fetch("/api/backup");
      if (!res.ok) throw new Error("Помилка завантаження бекапу");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `budgetgraph-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success("Резервну копію успішно збережено", { id: toastId });
    } catch (err: any) {
      toast.error("Не вдалося завантажити бекап", {
        id: toastId,
        description: err.message,
      });
    }
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!confirm("Ви впевнені, що хочете відновити дані з вибраного файлу?")) {
      e.target.value = "";
      return;
    }

    setIsRestoring(true);
    const toastId = toast.loading("Відновлення даних з бекапу...");

    try {
      const fileText = await file.text();
      const parsedJson = JSON.parse(fileText);

      const res = await fetch("/api/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsedJson),
      });

      const result = await res.json();
      if (!res.ok || result.error) {
        throw new Error(result.error || "Помилка відновлення");
      }

      toast.success("Дані успішно відновлено!", {
        id: toastId,
        description: `Відновлено таблиць: ${Object.keys(result.restored || {}).length}`,
      });

      if (onRestoreSuccess) {
        await onRestoreSuccess();
      }
    } catch (err: any) {
      toast.error("Помилка відновлення даних", {
        id: toastId,
        description: err.message,
      });
    } finally {
      setIsRestoring(false);
      e.target.value = "";
    }
  };

  return (
    <header className="mb-4 flex flex-col justify-between gap-3 border-b border-zinc-800/80 pb-3 md:flex-row md:items-end">
      <HeaderAmountDisplay spentWhole={spentWhole} spentCents={spentCents} />

      <div className="flex items-center gap-2 text-xs">
        <HeaderMetricsPills
          recurringTotal={recurringTotal}
          transactionCount={transactionCount}
        />

        <SettingsDropdownMenu
          isSendingDigest={isSendingDigest}
          isSendingBackupTelegram={isSendingBackupTelegram}
          isRestoring={isRestoring}
          onOpenNewCycle={onOpenNewCycle}
          onOpenImport={onOpenImport}
          onRegisterDevice={onRegisterDevice}
          onLogout={onLogout}
          onExportExcel={onExportExcel}
          onOpenTrash={onOpenTrash}
          onOpenMerchantRules={onOpenMerchantRules}
          onSendTestDigest={handleSendTestDigest}
          onSendBackupToTelegram={handleSendBackupToTelegram}
          onDownloadBackup={handleDownloadBackup}
          onTriggerRestoreFile={() => fileInputRef.current?.click()}
        />
      </div>

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelected}
        accept=".json,application/json"
        className="hidden"
      />
    </header>
  );
});
