import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Transaction, RecurringItem } from "@/types/finance";

export interface DateRangeFilter {
  from?: string;
  to?: string;
}

// Ключі для кешу
export const FINANCE_KEYS = {
  transactions: (range?: DateRangeFilter) =>
    range ? (["transactions", range] as const) : (["transactions"] as const),
  recurring: ["recurring"] as const,
  budget: (month: string) => ["budget", month] as const,
  analyticsPace: (from?: string, to?: string) =>
    ["analytics", "pace", from, to] as const,
};

export function useFinanceQueries(
  isAuthenticated: boolean | null,
  dateRange?: DateRangeFilter
) {
  const queryClient = useQueryClient();

  // Запит транзакцій через внутрішній захищений API з кешуванням
  const transactionsQuery = useQuery({
    queryKey: FINANCE_KEYS.transactions(dateRange),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (dateRange?.from) params.set("from", dateRange.from);
      if (dateRange?.to) params.set("to", dateRange.to);

      const queryString = params.toString();
      const url = queryString
        ? `/api/transactions?${queryString}`
        : "/api/transactions";

      const res = await fetch(url);
      if (!res.ok) {
        throw new Error("Не вдалося завантажити транзакції");
      }
      const data = await res.json();
      return (data.transactions || []) as Transaction[];
    },
    enabled: Boolean(isAuthenticated),
    staleTime: 5 * 60 * 1000, // 5 хвилин вважаємо дані свіжими
    gcTime: 30 * 60 * 1000, // 30 хвилин у пам'яті
    refetchOnWindowFocus: false, // запобігає зайвим запитам при поверненні в PWA
  });

  // Запит постійних платежів
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
    staleTime: 15 * 60 * 1000, // Шаблони змінюються рідко (15 хвилин)
    gcTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // Запит аналітики темпу та лімітів витрат
  const pacingQuery = useQuery({
    queryKey: FINANCE_KEYS.analyticsPace(dateRange?.from, dateRange?.to),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (dateRange?.from) params.set("from", dateRange.from);
      if (dateRange?.to) params.set("to", dateRange.to);

      const res = await fetch(
        `/api/analytics/budget-pace?${params.toString()}`
      );
      if (!res.ok) throw new Error("Не вдалося завантажити аналітику темпу");
      const data = await res.json();
      return data.pacing;
    },
    enabled: Boolean(isAuthenticated),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // Функції для ручної інвалідації кешу (скидають кеш для всіх діапазонів)
  const invalidateTransactions = () => {
    queryClient.invalidateQueries({ queryKey: ["transactions"] });
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
    pacing: pacingQuery.data,
    isLoadingPacing: pacingQuery.isLoading,
    invalidateTransactions,
    invalidateRecurring,
  };
}
