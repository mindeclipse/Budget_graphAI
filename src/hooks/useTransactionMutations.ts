import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Transaction } from "@/types/finance";

interface UpdateTransactionPayload {
  id: number;
  category_name?: string;
  merchant_raw?: string;
  clean_title?: string;
  tags?: string[];
  save_as_rule?: boolean;
}

interface CreateTransactionPayload {
  amount: number;
  currency?: "UAH" | "USD" | "EUR";
  merchant_raw: string;
  category_name?: string;
  source?: "manual" | "monobank" | "recurring" | "csv";
  type?: "expense" | "income";
  created_at?: string;
}

export function useTransactionMutations() {
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
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["analytics"] });
    },
  });

  // 3. Створення нової транзакції
  const createMutation = useMutation({
    mutationFn: async (payload: CreateTransactionPayload) => {
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

      const optimisticItem: Transaction = {
        id: -Date.now(),
        amount: newTx.amount,
        currency: newTx.currency || "UAH",
        merchant_raw: newTx.merchant_raw,
        category_name: newTx.category_name || "Інше",
        source: newTx.source || "manual",
        type: newTx.type || "expense",
        created_at: newTx.created_at || new Date().toISOString(),
        exclude_from_budget: false,
      } as Transaction;

      queryClient.setQueriesData<Transaction[]>(
        { queryKey: ["transactions"] },
        (old = []) => [optimisticItem, ...old]
      );

      return { previousData };
    },
    onError: (err: any, variables, context) => {
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
    },
  });

  return {
    updateTransaction: updateMutation.mutate,
    deleteTransaction: deleteMutation.mutate,
    createTransaction: createMutation.mutate,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
    isCreating: createMutation.isPending,
  };
}
