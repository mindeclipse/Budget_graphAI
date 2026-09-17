import { useState } from "react";
import { RecurringItem } from "@/types/finance";
import { DetectedSubscription } from "@/lib/subscription-radar";
import { triggerHaptic } from "@/lib/haptics";
import { toast } from "sonner";

export interface UseRecurringActionsProps {
  commercialRates: {
    USD: number;
    EUR: number;
    PLN: number;
  };
  markRecurringPaidOptimistic: (id: number, amount: number) => void;
  createTransaction: (
    tx: any,
    options?: { onSuccess?: () => void; onError?: (err: any) => void }
  ) => void;
  invalidateRecurring: () => void;
  invalidateRadar: () => void;
  openEditRecurring: (item: RecurringItem) => void;
  closeRecurringModal: () => void;
}

export function useRecurringActions({
  commercialRates,
  markRecurringPaidOptimistic,
  createTransaction,
  invalidateRecurring,
  invalidateRadar,
  openEditRecurring,
  closeRecurringModal,
}: UseRecurringActionsProps) {
  const [isExecutingRecurring, setIsExecutingRecurring] = useState<
    number | null
  >(null);

  const handleSaveRecurring = async (formData: {
    id?: number;
    title: string;
    amount: number;
    currency: "UAH" | "USD";
    category_name: string;
    day_of_month: number;
  }) => {
    try {
      if (formData.id) {
        const res = await fetch("/api/recurring", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formData),
        });
        if (!res.ok) throw new Error("Помилка оновлення шаблону");
      } else {
        const newItem = { ...formData, is_active: true };
        const res = await fetch("/api/recurring", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(newItem),
        });
        if (!res.ok) throw new Error("Помилка створення шаблону");
      }

      invalidateRecurring();
      invalidateRadar();
      closeRecurringModal();
    } catch (err) {
      console.error("Помилка збереження регулярного платежу:", err);
    }
  };

  const handleDeleteRecurring = async (id: number) => {
    await fetch(`/api/recurring?id=${id}`, { method: "DELETE" });
    invalidateRecurring();
    invalidateRadar();
    closeRecurringModal();
  };

  const handleExecuteRecurring = async (item: RecurringItem) => {
    if (isExecutingRecurring === item.id) return;
    setIsExecutingRecurring(item.id);

    try {
      const isUsd = item.currency === "USD";
      let finalAmount = Number(item.amount);
      let merchantTitle = item.title;

      if (isUsd) {
        const rateRes = await fetch("/api/currency/rate").catch(() => null);
        const rateData = rateRes?.ok
          ? await rateRes.json()
          : { rate: commercialRates.USD };
        finalAmount = Math.round(Number(item.amount) * rateData.rate);
        merchantTitle = `${item.title} ($${item.amount})`;
      }

      // 1. Миттєве оптимістичне оновлення Радара (0ms) — підписка одразу стає «Сплачено» та опускається вниз
      markRecurringPaidOptimistic(item.id, finalAmount);
      triggerHaptic("success");
      toast.success("Підписку проведено", {
        description: `${item.title} — ${finalAmount.toLocaleString("uk-UA")} ₴ враховано в цьому циклі`,
      });

      // 2. Створення транзакції з метаданими прив'язки до шаблону
      const newTx = {
        amount: finalAmount,
        currency: "UAH" as const,
        merchant_raw: merchantTitle,
        category_name: item.category_name,
        source: "recurring" as const,
        type: "expense" as const,
        metadata: {
          recurring_id: item.id,
        },
      };

      createTransaction(newTx, {
        onSuccess: () => {
          invalidateRadar();
          invalidateRecurring();
        },
        onError: (err: any) => {
          console.error("Помилка списання регулярного платежу:", err);
          invalidateRadar();
        },
      });
    } catch (err) {
      console.error("Помилка підготовки транзакції:", err);
      invalidateRadar();
    } finally {
      setIsExecutingRecurring(null);
    }
  };

  const handleAddDetectedFromRadar = (sub: DetectedSubscription) => {
    openEditRecurring({
      id: 0,
      title: sub.title,
      amount: sub.amount,
      currency: sub.currency,
      category_name: sub.category_name,
      day_of_month: sub.predicted_day_of_month,
      is_active: true,
    });
  };

  const handleDismissDetectedFromRadar = async (
    signature: string,
    title?: string
  ) => {
    try {
      const cleanId = signature.replace(/-[0-9]+-[a-z]+$/, "");
      const cleanMerchant = cleanId.replace(/^radar-/, "");
      const itemsToAdd = [signature, cleanId, cleanMerchant];
      if (title) itemsToAdd.push(title);

      const stored = localStorage.getItem("budget_dismissed_radar_subs");
      const current: string[] = stored ? JSON.parse(stored) : [];
      let changed = false;

      for (const item of itemsToAdd) {
        if (!current.includes(item)) {
          current.push(item);
          changed = true;
        }
      }

      if (changed) {
        localStorage.setItem(
          "budget_dismissed_radar_subs",
          JSON.stringify(current)
        );
      }

      // Синхронізуємо на сервер у cookie для довгострокового збереження між сесіями та пристроями
      await fetch("/api/recurring/radar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "dismiss",
          signature,
          title,
          cleanId,
          cleanMerchant,
        }),
      }).catch(() => null);

      invalidateRadar();
    } catch (e) {
      console.error("Error dismissing radar subscription:", e);
    }
  };

  return {
    isExecutingRecurring,
    handleSaveRecurring,
    handleDeleteRecurring,
    handleExecuteRecurring,
    handleAddDetectedFromRadar,
    handleDismissDetectedFromRadar,
  };
}
