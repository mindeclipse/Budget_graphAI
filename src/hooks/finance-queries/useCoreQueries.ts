import { useQuery } from "@tanstack/react-query";
import { Transaction, RecurringItem } from "@/types/finance";
import { SubscriptionRadarResult } from "@/lib/subscription-radar";
import { FINANCE_KEYS, DateRangeFilter, CyclesResponse } from "./keys";

export function useTransactionsQuery(
  isAuthenticated: boolean | null,
  dateRange?: DateRangeFilter
) {
  return useQuery({
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
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

export function useInvestmentTransactionsQuery(
  isAuthenticated: boolean | null
) {
  return useQuery({
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
    staleTime: 2 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

export function useRecurringQuery(isAuthenticated: boolean | null) {
  return useQuery({
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
    staleTime: 15 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

export function useRadarQuery(isAuthenticated: boolean | null) {
  return useQuery({
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
    staleTime: 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

export function useCyclesQuery(isAuthenticated: boolean | null) {
  return useQuery({
    queryKey: FINANCE_KEYS.cycles,
    queryFn: async (): Promise<CyclesResponse> => {
      const res = await fetch("/api/cycles");
      if (!res.ok) throw new Error("Не вдалося завантажити розрахункові цикли");
      const data = await res.json();
      return {
        activeCycle: data.activeCycle || null,
        cycles: Array.isArray(data.cycles) ? data.cycles : [],
      };
    },
    enabled: Boolean(isAuthenticated),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

export function useWealthSummaryQuery(isAuthenticated: boolean | null) {
  return useQuery({
    queryKey: FINANCE_KEYS.wealthSummary,
    queryFn: async () => {
      const res = await fetch("/api/wealth/summary");
      if (!res.ok) throw new Error("Не вдалося завантажити фінансовий огляд");
      return await res.json();
    },
    enabled: Boolean(isAuthenticated),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
