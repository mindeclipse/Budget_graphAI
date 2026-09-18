import { useQuery } from "@tanstack/react-query";
import { FINANCE_KEYS, DateRangeFilter } from "./keys";
import { PersonalCpiReport } from "@/lib/personal-cpi";

/**
 * Окремий хук для запиту аналітики темпу витрат (на вимогу)
 */
export function useBudgetPaceQuery(
  isAuthenticated: boolean | null,
  dateRange?: DateRangeFilter
) {
  return useQuery({
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
