import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Transaction } from "@/types/finance";
import { triggerHaptic } from "@/lib/haptics";
import { enqueueTransaction } from "@/lib/offline-queue";
import { UpdateTransactionPayload, CreateTransactionPayload } from "./types";

export function useCrudMutations() {
  const queryClient = useQueryClient();

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
                  exclude_from_budget:
                    newTxData.exclude_from_budget !== undefined
                      ? newTxData.exclude_from_budget
                      : item.exclude_from_budget,
                  metadata:
                    newTxData.metadata !== undefined
                      ? (newTxData.metadata as any)
                      : item.metadata,
                }
              : item
          )
      );

      triggerHaptic("selection");
      return { previousData };
    },
    onError: (err, _, context) => {
      if (context?.previousData) {
        context.previousData.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data);
        });
      }
      toast.error("Помилка оновлення", {
        description:
          err instanceof Error ? err.message : "Не вдалося зберегти зміни",
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: ["transactions"],
        refetchType: "all",
      });
      queryClient.invalidateQueries({
        queryKey: ["analytics"],
        refetchType: "all",
      });
      queryClient.invalidateQueries({
        queryKey: ["wealth", "summary"],
        refetchType: "all",
      });
    },
  });

  // 2. Створення нової транзакції з оптимістичним оновленням
  const createMutation = useMutation({
    mutationFn: async (payload: CreateTransactionPayload) => {
      // Якщо офлайн — додаємо в чергу
      if (typeof window !== "undefined" && !navigator.onLine) {
        const tempId = -Date.now();
        const queuedTx: Transaction = {
          id: tempId,
          amount: payload.amount,
          currency: payload.currency || "UAH",
          merchant_raw: payload.merchant_raw,
          category_name: payload.category_name || "Інше",
          source: payload.source || "manual",
          type: payload.type || "expense",
          created_at: payload.created_at || new Date().toISOString(),
          exclude_from_budget: payload.exclude_from_budget ?? false,
          tags: payload.tags || [],
          metadata: payload.metadata || null,
        };
        enqueueTransaction(queuedTx as any);
        return { success: true, transaction: queuedTx, isOffline: true };
      }

      try {
        const res = await fetch("/api/transactions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || "Не вдалося створити транзакцію");
        }
        return res.json();
      } catch (err) {
        // Fallback в офлайн-чергу у випадку збою мережі
        const tempId = -Date.now();
        const queuedTx: Transaction = {
          id: tempId,
          amount: payload.amount,
          currency: payload.currency || "UAH",
          merchant_raw: payload.merchant_raw,
          category_name: payload.category_name || "Інше",
          source: payload.source || "manual",
          type: payload.type || "expense",
          created_at: payload.created_at || new Date().toISOString(),
          exclude_from_budget: payload.exclude_from_budget ?? false,
          tags: payload.tags || [],
          metadata: payload.metadata || null,
        };
        enqueueTransaction(queuedTx as any);
        return { success: true, transaction: queuedTx, isOffline: true };
      }
    },
    onMutate: async (newTx) => {
      await queryClient.cancelQueries({ queryKey: ["transactions"] });

      const previousData = queryClient.getQueriesData<Transaction[]>({
        queryKey: ["transactions"],
      });

      const tempId = -Date.now();
      const optimisticTx: Transaction = {
        id: tempId,
        amount: newTx.amount,
        currency: newTx.currency || "UAH",
        merchant_raw: newTx.merchant_raw,
        category_name: newTx.category_name || "Інше",
        source: newTx.source || "manual",
        type: newTx.type || "expense",
        created_at: newTx.created_at || new Date().toISOString(),
        exclude_from_budget: newTx.exclude_from_budget ?? false,
        tags: newTx.tags || [],
        metadata: newTx.metadata || null,
      };

      queryClient.setQueriesData<Transaction[]>(
        { queryKey: ["transactions"] },
        (old = []) => [optimisticTx, ...old]
      );

      if (newTx.type === "investment") {
        queryClient.setQueriesData<Transaction[]>(
          { queryKey: ["transactions", "investment"] },
          (old = []) => [optimisticTx, ...old]
        );
      }

      triggerHaptic("success");
      return { previousData };
    },
    onSuccess: (data) => {
      if (data?.isOffline) {
        toast.info("Збережено офлайн", {
          id: "offline-tx-saved",
          description: "Транзакція синхронізується при появі інтернету",
        });
      }
    },
    onError: (err, _, context) => {
      if (context?.previousData) {
        context.previousData.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data);
        });
      }
      toast.error("Помилка створення", {
        description:
          err instanceof Error ? err.message : "Не вдалося зберегти транзакцію",
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: ["transactions"],
        refetchType: "all",
      });
      queryClient.invalidateQueries({
        queryKey: ["transactions", "investment"],
        refetchType: "all",
      });
      queryClient.invalidateQueries({
        queryKey: ["analytics"],
        refetchType: "all",
      });
      queryClient.invalidateQueries({
        queryKey: ["wealth", "summary"],
        refetchType: "all",
      });
    },
  });

  // 3. М'яке видалення транзакції
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

      let deletedItem: Transaction | undefined;

      queryClient.setQueriesData<Transaction[]>(
        { queryKey: ["transactions"] },
        (old = []) => {
          deletedItem = old.find((t) => t.id === deletedId);
          return old.filter((t) => t.id !== deletedId);
        }
      );

      triggerHaptic("warning");
      return { previousData, deletedItem };
    },
    onSuccess: (_, deletedId, context) => {
      const deletedMerchant = context?.deletedItem?.merchant_raw || "Операцію";
      toast.success(`${deletedMerchant} переміщено в кошик`, {
        id: `tx-deleted-${deletedId}`,
        action: {
          label: "Відновити",
          onClick: async () => {
            try {
              const res = await fetch("/api/transactions/restore", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: deletedId }),
              });
              if (!res.ok) throw new Error("Не вдалося відновити");
              triggerHaptic("success");
              queryClient.invalidateQueries({ queryKey: ["transactions"] });
              queryClient.invalidateQueries({ queryKey: ["analytics"] });
              toast.success("Транзакцію успішно відновлено");
            } catch {
              toast.error("Помилка відновлення транзакції");
            }
          },
        },
      });
    },
    onError: (err, _, context) => {
      if (context?.previousData) {
        context.previousData.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data);
        });
      }
      toast.error("Помилка видалення", {
        description:
          err instanceof Error ? err.message : "Не вдалося видалити операцію",
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["analytics"] });
    },
  });

  return {
    updateMutation,
    createMutation,
    deleteMutation,
  };
}
