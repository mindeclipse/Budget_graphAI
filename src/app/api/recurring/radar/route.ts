import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { verifySessionToken } from "@/lib/session";
import { getUsdRate } from "@/lib/currency";
import {
  detectSubscriptions,
  buildUpcomingSchedule,
} from "@/lib/subscription-radar";
import { Transaction, RecurringItem } from "@/types/finance";
import { getCycleDateRange } from "@/lib/cycle-utils";

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

export async function GET(req: NextRequest) {
  try {
    if (!(await checkAuthSession())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const dismissedParam = searchParams.get("dismissed") || "";
    const cookieStore = await cookies();
    const cookieDismissed =
      cookieStore.get("budget_dismissed_radar")?.value || "";
    const decodedCookie = cookieDismissed
      ? decodeURIComponent(cookieDismissed)
      : "";

    const combinedRaw = `${dismissedParam},${decodedCookie}`;
    const dismissedSignatures = Array.from(
      new Set(
        combinedRaw
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      )
    );

    const supabaseAdmin = getSupabaseAdmin();

    // 1. Отримуємо транзакції за останні 180 днів з пагінацією (виключаючи видалені)
    // Використовуємо сортування за спаданням і пагінацію, щоб не втратити свіжі транзакції через ліміт PostgREST (1000 рядків)
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - 180);

    const CHUNK_SIZE = 1000;
    const allTransactions: Transaction[] = [];
    let offset = 0;
    let hasMore = true;

    while (hasMore && allTransactions.length < 5000) {
      const { data, error: txError } = await supabaseAdmin
        .from("transactions")
        .select(
          "id, amount, currency, merchant_raw, category_name, source, type, created_at, exclude_from_budget, tags, deleted_at"
        )
        .is("deleted_at", null)
        .gte("created_at", fromDate.toISOString())
        .order("created_at", { ascending: false })
        .range(offset, offset + CHUNK_SIZE - 1);

      if (txError) throw txError;
      if (data && data.length > 0) {
        allTransactions.push(...(data as Transaction[]));
        if (data.length < CHUNK_SIZE) {
          hasMore = false;
        } else {
          offset += CHUNK_SIZE;
        }
      } else {
        hasMore = false;
      }
    }

    // 2. Отримуємо всі наявні шаблони постійних витрат
    const { data: rawTemplates, error: tmplError } = await supabaseAdmin
      .from("recurring_templates")
      .select(
        "id, title, amount, currency, category_name, day_of_month, is_active, created_at"
      )
      .order("day_of_month", { ascending: true });

    if (tmplError) throw tmplError;

    const transactions = allTransactions;
    const templates = (rawTemplates || []) as RecurringItem[];

    // 3. Визначаємо межі активного зарплатного циклу або календарного місяця
    const { data: activeCycle } = await supabaseAdmin
      .from("budget_cycles")
      .select(
        "id, name, start_date, end_date, budget_limit, is_active, created_at"
      )
      .eq("is_active", true)
      .maybeSingle();

    const now = new Date();
    let periodStart: Date;
    let periodEnd: Date;

    const fromQuery = searchParams.get("from");
    const toQuery = searchParams.get("to");

    if (fromQuery && toQuery) {
      periodStart = new Date(fromQuery);
      periodEnd = new Date(toQuery);
    } else if (activeCycle && activeCycle.start_date) {
      const cycleRange = getCycleDateRange(activeCycle, now);
      periodStart = new Date(cycleRange.startDate);
      periodStart.setHours(0, 0, 0, 0);
      periodEnd = new Date(cycleRange.endDate);
      periodEnd.setHours(23, 59, 59, 999);
    } else {
      periodStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      periodEnd = new Date(
        now.getFullYear(),
        now.getMonth() + 1,
        0,
        23,
        59,
        59,
        999
      );
    }

    const currentPeriodTransactions = transactions.filter((t) => {
      const time = new Date(t.created_at).getTime();
      return time >= periodStart.getTime() && time <= periodEnd.getTime();
    });

    // 4. Отримуємо актуальний комерційний курс USD
    const usdRate = await getUsdRate();

    // 5. Запускаємо рушій детекції та формування розкладу
    const detected = detectSubscriptions(
      transactions,
      templates,
      dismissedSignatures
    );
    const { upcoming, metrics } = buildUpcomingSchedule(
      templates,
      currentPeriodTransactions,
      usdRate,
      now
    );

    metrics.detected_count = detected.length;

    return NextResponse.json({
      detected,
      upcoming,
      metrics,
    });
  } catch (error: any) {
    console.error("[API recurring/radar GET error]:", error);
    return NextResponse.json(
      { error: getSafeErrorMessage(error) },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!(await checkAuthSession())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { action, signature, title, cleanId, cleanMerchant } = body || {};

    if (action === "dismiss") {
      const cookieStore = await cookies();
      const existingCookie =
        cookieStore.get("budget_dismissed_radar")?.value || "";
      const existingList = existingCookie
        ? decodeURIComponent(existingCookie).split(",")
        : [];

      const newItems = [signature, title, cleanId, cleanMerchant].filter(
        Boolean
      );
      const combined = Array.from(
        new Set(
          [...existingList, ...newItems].map((s) => s.trim()).filter(Boolean)
        )
      );

      const response = NextResponse.json({
        success: true,
        count: combined.length,
      });

      response.cookies.set(
        "budget_dismissed_radar",
        encodeURIComponent(combined.join(",")),
        {
          path: "/",
          maxAge: 31536000, // 1 рік
          sameSite: "lax",
          httpOnly: false,
        }
      );

      return response;
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error: any) {
    console.error("[API recurring/radar POST error]:", error);
    return NextResponse.json(
      { error: getSafeErrorMessage(error) },
      { status: 500 }
    );
  }
}
