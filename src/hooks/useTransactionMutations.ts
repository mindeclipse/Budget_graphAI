import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Transaction } from "@/types/finance";

interface UpdateTransactionPayload {
  id: string | number;
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

  // 1. Оптимістичне оновлення транзакції
  const updateMutation = useMutation({
    mutationFn: async (payload: UpdateTransactionPayload) => {
      const res = await fetch("/api/transactions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Не вдалося оновити транзакцію");
      }
      return res.json();
    },
    onMutate: async (newTxData) => {
      // Скасовуємо активні вибірки транзакцій, щоб уникнути race conditions
      await queryClient.cancelQueries({ queryKey: ["transactions"] });

      // Зберігаємо зліпок поточного стану кешу для відкату
      const previousData = queryClient.getQueriesData<Transaction[]>({
        queryKey: ["transactions"],
      });

      // Оптимістично оновлюємо всі збіги списків транзакцій у пам'яті
      queryClient.setQueriesData<Transaction[]>(
        { queryKey: ["transactions"] },
        (old = []) =>
          old.map((item) => {
            if (String(item.id) === String(newTxData.id)) {
              return {
                ...item,
                category_name: newTxData.category_name ?? item.category_name,
                merchant_raw:
                  newTxData.clean_title ??
                  newTxData.merchant_raw ??
                  item.merchant_raw,
                tags: newTxData.tags ?? item.tags,
              };
            }
            return item;
          })
      );

      return { previousData };
    },
    onError: (_err, _variables, context) => {
      // Відновлюємо стан у разі збою
      if (context?.previousData) {
        context.previousData.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data);
        });
      }
    },
    onSettled: () => {
      // Інвалідуємо списки та аналітику для фонової синхронізації
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["analytics"] });
    },
  });

  // 2. Оптимістичне видалення транзакції
  const deleteMutation = useMutation({
    mutationFn: async (id: string | number) => {
      const res = await fetch(`/api/transactions?id=${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Не вдалося видалити транзакцію");
      }
      return res.json();
    },
    onMutate: async (deletedId) => {
      await queryClient.cancelQueries({ queryKey: ["transactions"] });

      const previousData = queryClient.getQueriesData<Transaction[]>({
        queryKey: ["transactions"],
      });

      // Миттєво прибираємо запис з UI
      queryClient.setQueriesData<Transaction[]>(
        { queryKey: ["transactions"] },
        (old = []) =>
          old.filter((item) => String(item.id) !== String(deletedId))
      );

      return { previousData };
    },
    onError: (_err, _id, context) => {
      if (context?.previousData) {
        context.previousData.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data);
        });
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["analytics"] });
    },
  });

  // 3. Оптимістичне додавання транзакції вручну
  const createMutation = useMutation({
    mutationFn: async (payload: CreateTransactionPayload) => {
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Не вдалося зберегти транзакцію");
      }
      return res.json();
    },
    onMutate: async (newTx) => {
      await queryClient.cancelQueries({ queryKey: ["transactions"] });

      const previousData = queryClient.getQueriesData<Transaction[]>({
        queryKey: ["transactions"],
      });

      // Створюємо тимчасовий об'єкт із числовим псевдо-ID
      const optimisticItem: Transaction = {
        id: -Date.now(), // Число (number), щоб не ламалися типи й компоненти
        amount: newTx.amount,
        currency: newTx.currency || "UAH",
        merchant_raw: newTx.merchant_raw,
        category_name: newTx.category_name || "Інше",
        source: newTx.source || "manual",
        type: newTx.type || "expense",
        created_at: newTx.created_at || new Date().toISOString(),
        exclude_from_budget: false, // Гарантує проходження фільтра в useFinanceQueries
      } as Transaction;
      queryClient.setQueriesData<Transaction[]>(
        { queryKey: ["transactions"] },
        (old = []) => [optimisticItem, ...old]
      );

      return { previousData };
    },
    onError: (_err, _variables, context) => {
      if (context?.previousData) {
        context.previousData.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data);
        });
      }
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
