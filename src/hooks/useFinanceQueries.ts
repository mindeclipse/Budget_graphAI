import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Transaction, RecurringItem } from "@/types/finance";

// Ключі для кешу
export const FINANCE_KEYS = {
  transactions: ["transactions"] as const,
  recurring: ["recurring"] as const,
  budget: (month: string) => ["budget", month] as const,
};

export function useFinanceQueries(isAuthenticated: boolean | null) {
  const queryClient = useQueryClient();

  // Кешований запит транзакцій
  const transactionsQuery = useQuery({
    queryKey: FINANCE_KEYS.transactions,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data || []) as Transaction[];
    },
    enabled: Boolean(isAuthenticated),
  });

  // Кешований запит постійних платежів
  const recurringQuery = useQuery({
    queryKey: FINANCE_KEYS.recurring,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recurring_templates")
        .select("*")
        .order("day_of_month", { ascending: true });

      if (error) throw error;
      return (data || []) as RecurringItem[];
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
    transactions: transactionsQuery.data || [],
    isLoadingTransactions: transactionsQuery.isLoading,
    recurring: recurringQuery.data || [],
    isLoadingRecurring: recurringQuery.isLoading,
    invalidateTransactions,
    invalidateRecurring,
  };
}
