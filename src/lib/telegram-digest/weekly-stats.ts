import { SupabaseClient } from "@supabase/supabase-js";
import { Transaction } from "@/types/finance";
import { WeeklyCategoryBreakdown } from "./types";

export interface WeeklySpendingStats {
  currentWeekTx: Transaction[];
  prevWeekTx: any[];
  thisWeekSpent: number;
  prevWeekSpent: number;
  wowText: string;
  sortedCategories: WeeklyCategoryBreakdown[];
  largestTx: Transaction | undefined;
  totalInvestedThisWeek: number;
  totalSavedThisWeek: number;
}

/**
 * Розраховує витрати, інвестиції, заощадження та динаміку WoW за тиждень.
 */
export function calculateWeeklySpendingStats(
  rawTransactions: any[],
  currentWeekStart: Date,
  prevWeekStart: Date
): WeeklySpendingStats {
  const expenseTransactions = (rawTransactions || []).filter(
    (t) => t.type === "expense" && !t.exclude_from_budget
  );

  const currentWeekTx = expenseTransactions.filter(
    (t) => new Date(t.created_at) >= currentWeekStart
  ) as unknown as Transaction[];

  const prevWeekTx = expenseTransactions.filter(
    (t) =>
      new Date(t.created_at) >= prevWeekStart &&
      new Date(t.created_at) < currentWeekStart
  );

  const thisWeekSpent = currentWeekTx.reduce(
    (sum, t) => sum + Number(t.amount || 0),
    0
  );
  const prevWeekSpent = prevWeekTx.reduce(
    (sum, t) => sum + Number(t.amount || 0),
    0
  );

  // Інвестиції за 7 днів (відокремлені від споживчих витрат)
  const currentWeekInvestments = (rawTransactions || []).filter(
    (t) =>
      t.type === "investment" &&
      !t.exclude_from_budget &&
      new Date(t.created_at) >= currentWeekStart
  );

  const totalInvestedThisWeek = currentWeekInvestments
    .filter(
      (t) =>
        !t.merchant_raw?.toLowerCase().includes("дивіденд") &&
        !t.merchant_raw?.toLowerCase().includes("подат")
    )
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);

  // Заощадження (перекази у фінансову подушку/скарбничку)
  const currentWeekSavings = (rawTransactions || []).filter(
    (t) =>
      t.type === "transfer" &&
      !t.exclude_from_budget &&
      new Date(t.created_at) >= currentWeekStart &&
      !t.merchant_raw?.toLowerCase().includes("інжур") &&
      !t.merchant_raw?.toLowerCase().includes("inzhur")
  );

  const totalSavedThisWeek = currentWeekSavings.reduce(
    (sum, t) => sum + Number(t.amount || 0),
    0
  );

  // Динаміка порівняння з минулим тижнем (Week-over-Week)
  let wowText = "даних за попередній тиждень недостатньо";
  if (prevWeekSpent > 0) {
    const diffPercent = Math.round(
      ((thisWeekSpent - prevWeekSpent) / prevWeekSpent) * 100
    );
    if (diffPercent > 0) {
      wowText = `+${diffPercent}% до минулого тижня ↗️`;
    } else if (diffPercent < 0) {
      wowText = `${diffPercent}% до минулого тижня 📉`;
    } else {
      wowText = `на рівні минулого тижня ➡️`;
    }
  }

  // Топ категорії за 7 днів
  const categoryMap = new Map<string, number>();
  for (const t of currentWeekTx) {
    const cat = t.category_name || "Інше";
    categoryMap.set(cat, (categoryMap.get(cat) || 0) + Number(t.amount || 0));
  }

  const sortedCategories: WeeklyCategoryBreakdown[] = Array.from(
    categoryMap.entries()
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([name, amount]) => ({
      name,
      amount,
      percent:
        thisWeekSpent > 0 ? Math.round((amount / thisWeekSpent) * 100) : 0,
    }));

  // Виявлення найбільшої разової покупки
  const largestTx = [...currentWeekTx].sort(
    (a, b) => Number(b.amount || 0) - Number(a.amount || 0)
  )[0];

  return {
    currentWeekTx,
    prevWeekTx,
    thisWeekSpent,
    prevWeekSpent,
    wowText,
    sortedCategories,
    largestTx,
    totalInvestedThisWeek,
    totalSavedThisWeek,
  };
}

export interface WeeklyWishlistStats {
  savedWishlistAmount: number;
  savedWishlistItems: any[];
  coolingWishlistAmount: number;
  coolingWishlistItems: any[];
}

/**
 * Отримує статистику листа бажань (Wishlist) за останні 7 днів.
 */
export async function fetchWeeklyWishlistStats(
  supabase: SupabaseClient,
  currentWeekStart: Date,
  now: Date
): Promise<WeeklyWishlistStats> {
  const { data: wishlistData } = await supabase
    .from("wishlist_items")
    .select(
      "id, name, estimated_price, status, cooling_end_date, resolved_at, created_at"
    );

  const recentWishlist = wishlistData || [];

  const savedWishlistItems = recentWishlist.filter(
    (item) =>
      item.status === "saved" &&
      item.resolved_at &&
      new Date(item.resolved_at) >= currentWeekStart
  );
  const savedWishlistAmount = savedWishlistItems.reduce(
    (sum, item) => sum + Number(item.estimated_price || 0),
    0
  );

  const coolingWishlistItems = recentWishlist.filter(
    (item) =>
      item.status === "cooling" &&
      item.cooling_end_date &&
      new Date(item.cooling_end_date) > now
  );
  const coolingWishlistAmount = coolingWishlistItems.reduce(
    (sum, item) => sum + Number(item.estimated_price || 0),
    0
  );

  return {
    savedWishlistAmount,
    savedWishlistItems,
    coolingWishlistAmount,
    coolingWishlistItems,
  };
}
