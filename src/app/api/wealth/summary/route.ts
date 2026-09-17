import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { verifySessionToken } from "@/lib/session";
import { getCommercialRates } from "@/lib/currency";

export const dynamic = "force-dynamic";

async function checkAuthSession(): Promise<boolean> {
  const cookieStore = await cookies();
  const session = cookieStore.get("finance_session")?.value;
  const { valid } = await verifySessionToken(session);
  return valid;
}

function getSafeErrorMessage(error: any): string {
  return process.env.NODE_ENV === "production"
    ? "Помилка обробки запиту"
    : error?.message || "Помилка сервера";
}

export async function GET() {
  try {
    if (!(await checkAuthSession())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabaseAdmin = getSupabaseAdmin();

    // Паралельний запуск усіх вторинних вибірок (Batching)
    const [
      goalsRes,
      investRes,
      catBudgetsRes,
      rates,
      wishlistRes,
      costPerUseRes,
    ] = await Promise.all([
      supabaseAdmin
        .from("savings_goals")
        .select("*")
        .order("id", { ascending: true }),
      supabaseAdmin
        .from("investments")
        .select("*")
        .order("id", { ascending: true }),
      supabaseAdmin
        .from("category_budgets")
        .select("*")
        .order("category_name", { ascending: true }),
      getCommercialRates().catch(() => ({
        USD: 41.5,
        EUR: 45.3,
        PLN: 10.6,
        updatedAt: Date.now(),
        source: "fallback",
      })),
      supabaseAdmin
        .from("wishlist_items")
        .select("*")
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("cost_per_use_items")
        .select("*")
        .order("created_at", { ascending: false }),
    ]);

    // Обробка вішліста та охолодження імпульсивних покупок
    const now = new Date();
    const rawWishlist = wishlistRes.data || [];
    const wishlistItems = rawWishlist.map((item: any) => {
      if (item.status === "cooling" && new Date(item.cooling_end_date) <= now) {
        return { ...item, status: "ready" };
      }
      return item;
    });

    const wishlistSavedAmount = wishlistItems
      .filter((i: any) => i.status === "saved")
      .reduce((sum: number, i: any) => sum + Number(i.estimated_price || 0), 0);
    const coolingCount = wishlistItems.filter(
      (i: any) => i.status === "cooling"
    ).length;
    const readyCount = wishlistItems.filter(
      (i: any) => i.status === "ready"
    ).length;
    const pendingAmount = wishlistItems
      .filter((i: any) => i.status === "cooling" || i.status === "ready")
      .reduce((sum: number, i: any) => sum + Number(i.estimated_price || 0), 0);

    // Обробка вартості за використання (Cost-per-use ROI)
    let totalInvested = 0;
    let totalMoneySaved = 0;
    const rawCpu = costPerUseRes.data || [];
    const cpuItems = rawCpu.map((item: any) => {
      const price = Number(item.purchase_price || 0);
      const uses = Math.max(1, Number(item.total_uses || 1));
      const currentCost = Math.round((price / uses) * 100) / 100;
      totalInvested += price;

      let moneySaved = 0;
      let roiPercent = 0;

      if (
        item.benchmark_cost_per_use &&
        Number(item.benchmark_cost_per_use) > 0
      ) {
        const benchmark = Number(item.benchmark_cost_per_use);
        const totalBenchmarkValue = benchmark * uses;
        moneySaved = Math.max(0, totalBenchmarkValue - price);
        roiPercent = Math.round((totalBenchmarkValue / price) * 100);
        totalMoneySaved += moneySaved;
      }

      return {
        ...item,
        current_cost_per_use: currentCost,
        money_saved: moneySaved,
        roi_percent: roiPercent,
      };
    });

    // Мапа категорійних лімітів
    const categoryBudgetsMap: Record<string, number> = {};
    (catBudgetsRes.data || []).forEach((b: any) => {
      categoryBudgetsMap[b.category_name] = Number(b.monthly_limit);
    });

    return NextResponse.json(
      {
        success: true,
        goals: goalsRes.data || [],
        investments: investRes.data || [],
        budgets: catBudgetsRes.data || [],
        categoryBudgets: categoryBudgetsMap,
        rates,
        wishlist: {
          items: wishlistItems,
          metrics: {
            saved_amount: wishlistSavedAmount,
            cooling_count: coolingCount,
            ready_count: readyCount,
            pending_amount: pendingAmount,
          },
        },
        costPerUse: {
          items: cpuItems,
          metrics: {
            total_tracked_assets: cpuItems.length,
            total_invested: totalInvested,
            total_money_saved: Math.round(totalMoneySaved),
          },
        },
      },
      {
        headers: {
          "Cache-Control": "private, max-age=60, stale-while-revalidate=300",
        },
      }
    );
  } catch (error: any) {
    console.error("[API wealth/summary GET error]:", error);
    return NextResponse.json(
      { error: getSafeErrorMessage(error) },
      { status: 500 }
    );
  }
}
