import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Transaction, RecurringItem } from "@/types/finance";

// Ключі для кешу
export const FINANCE_KEYS = {
  transactions: ["transactions"] as const,
  recurring: ["recurring"] as const,
  budget: (month: string) => ["budget", month] as const,
};

export function useFinanceQueries(isAuthenticated: boolean | null) {
  const queryClient = useQueryClient();

  // Запит транзакцій через внутрішній захищений API
  const transactionsQuery = useQuery({
    queryKey: FINANCE_KEYS.transactions,
    queryFn: async () => {
      const res = await fetch("/api/transactions");
      if (!res.ok) {
        throw new Error("Не вдалося завантажити транзакції");
      }
      const data = await res.json();
      return (data.transactions || []) as Transaction[];
    },
    enabled: Boolean(isAuthenticated),
  });

  // Запит постійних платежів через API
  const recurringQuery = useQuery({
    queryKey: FINANCE_KEYS.recurring,
    queryFn: async () => {
      const res = await fetch("/api/recurring");
      if (!res.ok) {
        throw new Error("Не вдалося завантажити шаблони витрат");
      }
      const data = await res.json();
      return (data.items || []) as RecurringItem[];
    },
    enabled: Boolean(isAuthenticated),
  });

  // Функції для ручної інвалідації кешу при мутаціях (додавання/видалення)
  const invalidateTransactions = () => {
    queryClient.invalidateQueries({ queryKey: FINANCE_KEYS.transactions });
  };

  const invalidateRecurring = () => {
    queryClient.invalidateQueries({ queryKey: FINANCE_KEYS.recurring });
  };

  return {
    transactions: (transactionsQuery.data || []).filter(
      (t: any) => !t.exclude_from_budget
    ),
    isLoadingTransactions: transactionsQuery.isLoading,
    recurring: recurringQuery.data || [],
    isLoadingRecurring: recurringQuery.isLoading,
    invalidateTransactions,
    invalidateRecurring,
  };
}
