import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Transaction, RecurringItem } from "@/types/finance";
import { SubscriptionRadarResult } from "@/lib/subscription-radar";

import { PersonalCpiReport } from "@/lib/personal-cpi";

export interface DateRangeFilter {
  from?: string;
  to?: string;
}

// Ключі для кешу
export const FINANCE_KEYS = {
  transactions: (range?: DateRangeFilter) =>
    range ? (["transactions", range] as const) : (["transactions"] as const),
  investmentTransactions: ["transactions", "investment"] as const,
  recurring: ["recurring"] as const,
  radar: ["recurring", "radar"] as const,
  budget: (month: string) => ["budget", month] as const,
  analyticsPace: (from?: string, to?: string) =>
    ["analytics", "pace", from, to] as const,
  analyticsCpi: (year?: number, month?: number, from?: string, to?: string) =>
    ["analytics", "cpi", year, month, from, to] as const,
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

  // Окремий запит виключно для investment-транзакцій (Inzhur, ОВДП тощо).
  // Використовує endpoint ?type=investment з лімітом 5000, щоб охопити всю
  // повну історію незалежно від кількості щоденних витрат.
  const investmentTransactionsQuery = useQuery({
    queryKey: FINANCE_KEYS.investmentTransactions,
    queryFn: async () => {
      const res = await fetch("/api/transactions?type=investment");
      if (!res.ok) {
        throw new Error("Не вдалося завантажити інвестиційні транзакції");
      }
      const data = await res.json();
      return (data.transactions || []) as Transaction[];
    },
    enabled: Boolean(isAuthenticated),
    staleTime: 2 * 60 * 1000, // 2 хвилини — швидке оновлення після імпорту
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
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

  // Запит розумного радара підписок
  const radarQuery = useQuery({
    queryKey: FINANCE_KEYS.radar,
    queryFn: async () => {
      let dismissed = "";
      if (typeof window !== "undefined") {
        try {
          const stored = localStorage.getItem("budget_dismissed_radar_subs");
          if (stored) {
            const arr = JSON.parse(stored);
            if (Array.isArray(arr)) dismissed = arr.join(",");
          }
        } catch {}
      }

      const url = dismissed
        ? `/api/recurring/radar?dismissed=${encodeURIComponent(dismissed)}`
        : "/api/recurring/radar";

      const res = await fetch(url);
      if (!res.ok) throw new Error("Не вдалося завантажити радар підписок");
      return (await res.json()) as SubscriptionRadarResult;
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

  const invalidateInvestmentTransactions = () => {
    queryClient.invalidateQueries({
      queryKey: FINANCE_KEYS.investmentTransactions,
    });
  };

  const invalidateRecurring = () => {
    queryClient.invalidateQueries({ queryKey: FINANCE_KEYS.recurring });
    queryClient.invalidateQueries({ queryKey: FINANCE_KEYS.radar });
  };

  const invalidateRadar = () => {
    queryClient.invalidateQueries({ queryKey: FINANCE_KEYS.radar });
  };

  return {
    transactions: (transactionsQuery.data || []).filter(
      (t: any) => !t.exclude_from_budget
    ),
    isLoadingTransactions: transactionsQuery.isLoading,
    investmentTransactions: investmentTransactionsQuery.data || [],
    isLoadingInvestmentTransactions: investmentTransactionsQuery.isLoading,
    recurring: recurringQuery.data || [],
    isLoadingRecurring: recurringQuery.isLoading,
    pacing: pacingQuery.data,
    isLoadingPacing: pacingQuery.isLoading,
    radar: radarQuery.data,
    isLoadingRadar: radarQuery.isLoading,
    invalidateTransactions,
    invalidateInvestmentTransactions,
    invalidateRecurring,
    invalidateRadar,
  };
}

export function usePersonalCpiQuery(
  isAuthenticated: boolean | null,
  options?: { year?: number; month?: number; from?: string; to?: string }
) {
  return useQuery({
    queryKey: FINANCE_KEYS.analyticsCpi(
      options?.year,
      options?.month,
      options?.from,
      options?.to
    ),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (options?.year) params.set("year", String(options.year));
      if (options?.month) params.set("month", String(options.month));
      if (options?.from) params.set("from", options.from);
      if (options?.to) params.set("to", options.to);

      const res = await fetch(
        `/api/analytics/personal-cpi?${params.toString()}`
      );
      if (!res.ok) throw new Error("Не вдалося завантажити індекс інфляції");
      const data = await res.json();
      return data.cpi as PersonalCpiReport;
    },
    enabled: Boolean(isAuthenticated),
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
