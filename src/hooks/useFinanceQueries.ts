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

  // Кешований запит транзакцій з автоматичним викачуванням усіх сторінок
  const transactionsQuery = useQuery({
    queryKey: FINANCE_KEYS.transactions,
    queryFn: async () => {
      const PAGE_SIZE = 1000;
      let allTransactions: Transaction[] = [];
      let page = 0;
      const MAX_PAGES = 10; // Захист від нескінченного циклу (до 10 000 транзакцій)

      while (page < MAX_PAGES) {
        const from = page * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;

        const { data, error } = await supabase
          .from("transactions")
          .select("*")
          .order("created_at", { ascending: false })
          .range(from, to);

        if (error) throw error;
        if (!data || data.length === 0) break;

        allTransactions.push(...(data as Transaction[]));

        // Якщо прийшло менше ніж розмір сторінки — це був останній шматок даних
        if (data.length < PAGE_SIZE) break;

        page++;
      }

      console.log(
        `✅ Успішно завантажено транзакцій: ${allTransactions.length} (сторінок: ${page + 1})`
      );
      return allTransactions;
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
