import { useState, useEffect, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Transaction } from "@/types/finance";
import { triggerHaptic } from "@/lib/haptics";
import {
  enqueueTransaction,
  syncOfflineQueue,
  getOfflineQueue,
} from "@/lib/offline-queue";

interface UpdateTransactionPayload {
  id: number;
  category_name?: string;
  merchant_raw?: string;
  clean_title?: string;
  tags?: string[];
  save_as_rule?: boolean;
  exclude_from_budget?: boolean;
  metadata?: Record<string, any> | null;
}

interface CreateTransactionPayload {
  amount: number;
  currency?: "UAH" | "USD" | "EUR" | "PLN";
  merchant_raw: string;
  category_name?: string;
  source?:
    | "manual"
    | "monobank"
    | "recurring"
    | "csv"
    | "inzhur_statement"
    | "bank_receipt_pdf";
  type?: "expense" | "income" | "investment";
  created_at?: string;
  exclude_from_budget?: boolean;
  tags?: string[];
  metadata?: Record<string, any> | null;
}

export function useTransactionMutations() {
  const queryClient = useQueryClient();
  const [isSyncing, setIsSyncing] = useState(false);

  // Ручна або автоматична синхронізація черги
  const handleSyncQueue = useCallback(async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      const res = await syncOfflineQueue();
      if (res.synced > 0) {
        queryClient.invalidateQueries({ queryKey: ["transactions"] });
        queryClient.invalidateQueries({ queryKey: ["analytics"] });
        toast.success("Синхронізація успішна", {
          id: "offline-sync-success",
          description: `Офлайн-операцій збережено на сервері: ${res.synced}`,
        });
      }
    } catch (err) {
      console.error("[useTransactionMutations] Error during queue sync:", err);
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing, queryClient]);

  // Слухач відновлення мережі
  useEffect(() => {
    const onOnline = () => {
      const queue = getOfflineQueue();
      if (queue.length > 0) {
        handleSyncQueue();
      }
    };

    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [handleSyncQueue]);

  // 1. Оновлення транзакції
  const updateMutation = useMutation({
    mutationFn: async (payload: UpdateTransactionPayload) => {
      const res = await fetch("/api/transactions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Не вдалося оновити транзакцію");
      }
      return res.json();
    },
    onMutate: async (newTxData) => {
      await queryClient.cancelQueries({ queryKey: ["transactions"] });

      const previousData = queryClient.getQueriesData<Transaction[]>({
        queryKey: ["transactions"],
      });

      queryClient.setQueriesData<Transaction[]>(
        { queryKey: ["transactions"] },
        (old = []) =>
          old.map((item) =>
            item.id === newTxData.id
              ? {
                  ...item,
                  category_name: newTxData.category_name ?? item.category_name,
                  merchant_raw:
                    newTxData.clean_title ??
                    newTxData.merchant_raw ??
                    item.merchant_raw,
                  tags: newTxData.tags ?? item.tags,
                }
              : item
          )
      );

      return { previousData };
    },
    onError: (err: any, variables, context) => {
      if (context?.previousData) {
        context.previousData.forEach(([key, data]) => {
          queryClient.setQueryData(key, data);
        });
      }

      toast.error("Не вдалося оновити транзакцію", {
        id: `update-err-${variables.id}`,
        description: err.message || "Зміни скасовано через збій зв'язку",
        action: {
          label: "Повторити",
          onClick: () => updateMutation.mutate(variables),
        },
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["analytics"] });
    },
  });

  // 2. Видалення транзакції
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/transactions?id=${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Не вдалося видалити транзакцію");
      }
      return res.json();
    },
    onMutate: async (deletedId) => {
      await queryClient.cancelQueries({ queryKey: ["transactions"] });

      const previousData = queryClient.getQueriesData<Transaction[]>({
        queryKey: ["transactions"],
      });

      queryClient.setQueriesData<Transaction[]>(
        { queryKey: ["transactions"] },
        (old = []) => old.filter((item) => item.id !== deletedId)
      );

      return { previousData };
    },
    onError: (err: any, id, context) => {
      if (context?.previousData) {
        context.previousData.forEach(([key, data]) => {
          queryClient.setQueryData(key, data);
        });
      }

      toast.error("Не вдалося видалити", {
        id: `delete-err-${id}`,
        description: "Транзакцію повернуто до списку",
        action: {
          label: "Спробувати знову",
          onClick: () => deleteMutation.mutate(id),
        },
      });
    },
    onSuccess: (_, deletedId) => {
      queryClient.invalidateQueries({ queryKey: ["trash"] });
      toast("Переміщено в кошик", {
        id: `trash-tx-${deletedId}`,
        description: "Зберігатиметься 10 днів.",
        duration: 6000,
        action: {
          label: "Скасувати",
          onClick: () => restoreMutation.mutate(deletedId),
        },
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["analytics"] });
      queryClient.invalidateQueries({ queryKey: ["recurring"] });
      queryClient.invalidateQueries({ queryKey: ["recurring", "radar"] });
    },
  });

  // 2b. Відновлення транзакції з кошика
  const restoreMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch("/api/transactions/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Не вдалося відновити транзакцію");
      }
      return res.json();
    },
    onSuccess: () => {
      triggerHaptic("success");
      toast.success("Транзакцію відновлено", {
        id: "tx-restored",
      });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["trash"] });
      queryClient.invalidateQueries({ queryKey: ["analytics"] });
    },
    onError: (err: any) => {
      triggerHaptic("error");
      toast.error("Не вдалося відновити транзакцію", {
        description: err.message,
      });
    },
  });

  // 3. Створення нової транзакції (з підтримкою Offline-First черги)
  const createMutation = useMutation({
    mutationFn: async (payload: CreateTransactionPayload) => {
      // Якщо браузер вже перебуває в офлайні, одразу переходимо до черги
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        throw new TypeError("Failed to fetch: Browser is offline");
      }

      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Не вдалося зберегти транзакцію");
      }
      return res.json();
    },
    onMutate: async (newTx) => {
      await queryClient.cancelQueries({ queryKey: ["transactions"] });

      const previousData = queryClient.getQueriesData<Transaction[]>({
        queryKey: ["transactions"],
      });

      const tempId = -Date.now();
      const optimisticItem: Transaction = {
        id: tempId,
        amount: newTx.amount,
        currency: newTx.currency || "UAH",
        merchant_raw: newTx.merchant_raw,
        category_name: newTx.category_name || "Інше",
        source: newTx.source || "manual",
        type: newTx.type || "expense",
        created_at: newTx.created_at || new Date().toISOString(),
        exclude_from_budget: false,
        metadata: newTx.metadata || null,
      } as Transaction;

      queryClient.setQueriesData<Transaction[]>(
        { queryKey: ["transactions"] },
        (old = []) => [optimisticItem, ...old]
      );

      return { previousData, tempId };
    },
    onError: (err: any, variables, context) => {
      const isNetworkError =
        (typeof navigator !== "undefined" && !navigator.onLine) ||
        err?.name === "TypeError" ||
        err?.message?.includes("Failed to fetch") ||
        err?.message?.includes("NetworkError") ||
        err?.message?.includes("Load failed") ||
        err?.message?.includes("offline");

      if (isNetworkError) {
        // Зберігаємо в офлайн-чергу, НЕ видаляючи оптимістичний запис з UI
        enqueueTransaction(variables, context?.tempId);

        toast.info("Збережено офлайн", {
          id: "offline-tx-enqueued",
          description:
            "Витрата врахована в бюджеті та передасться на сервер автоматично при появі інтернету.",
          duration: 4000,
        });
        return;
      }

      // Якщо помилка валідації чи 4xx від сервера — відкочуємо оптимістичні дані
      if (context?.previousData) {
        context.previousData.forEach(([key, data]) => {
          queryClient.setQueryData(key, data);
        });
      }

      toast.error("Транзакцію не збережено", {
        id: "create-tx-error",
        description: err.message || "Сервер не відповів, запис знято зі списку",
        action: {
          label: "Повторити",
          onClick: () => createMutation.mutate(variables),
        },
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["analytics"] });
      queryClient.invalidateQueries({ queryKey: ["recurring"] });
      queryClient.invalidateQueries({ queryKey: ["recurring", "radar"] });
    },
  });

  return {
    updateTransaction: updateMutation.mutate,
    deleteTransaction: deleteMutation.mutate,
    restoreTransaction: restoreMutation.mutate,
    createTransaction: createMutation.mutate,
    syncQueue: handleSyncQueue,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
    isRestoring: restoreMutation.isPending,
    isCreating: createMutation.isPending,
    isSyncing,
  };
}
