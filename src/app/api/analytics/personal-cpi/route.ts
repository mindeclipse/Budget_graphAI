import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { verifySessionToken } from "@/lib/session";
import { calculatePersonalCpi, CpiTransaction } from "@/lib/personal-cpi";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    // 1. Криптографічна перевірка сесії (PIN-auth / Biometric)
    const cookieStore = await cookies();
    const session = cookieStore.get("finance_session")?.value;
    const { valid } = await verifySessionToken(session);

    if (!valid) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const now = new Date();

    // Параметри вибірки поточного періоду (за замовчуванням поточний календарний місяць)
    const yearParam = searchParams.get("year");
    const monthParam = searchParams.get("month"); // 1-12
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");

    let currentStart: Date;
    let currentEnd: Date;
    let currentPeriodLabel: string;

    if (fromParam && toParam) {
      currentStart = new Date(fromParam);
      currentEnd = new Date(toParam);
      if (isNaN(currentStart.getTime()) || isNaN(currentEnd.getTime())) {
        return NextResponse.json(
          { error: "Invalid date format" },
          { status: 400 }
        );
      }
      currentPeriodLabel = `${currentStart.toLocaleDateString("uk-UA", { month: "short" })} – ${currentEnd.toLocaleDateString("uk-UA", { month: "short", year: "numeric" })}`;
    } else {
      const year = yearParam ? parseInt(yearParam, 10) : now.getFullYear();
      const month = monthParam ? parseInt(monthParam, 10) - 1 : now.getMonth();
      currentStart = new Date(year, month, 1);
      currentEnd = new Date(year, month + 1, 0, 23, 59, 59, 999);
      currentPeriodLabel = currentStart.toLocaleDateString("uk-UA", {
        month: "long",
        year: "numeric",
      });
    }

    const supabase = getSupabaseAdmin();

    // 2. Вибірка транзакцій для поточного періоду (Strict projection: лише необхідні поля)
    const { data: currData, error: currErr } = await supabase
      .from("transactions")
      .select("id, amount, category_name, created_at, type")
      .is("deleted_at", null)
      .eq("type", "expense")
      .gte("created_at", currentStart.toISOString())
      .lte("created_at", currentEnd.toISOString())
      .order("created_at", { ascending: false });

    if (currErr) {
      return NextResponse.json({ error: currErr.message }, { status: 500 });
    }

    // 3. Спроба вибірки за аналогічний період минулого року (YoY)
    const yoyStart = new Date(currentStart);
    yoyStart.setFullYear(yoyStart.getFullYear() - 1);
    const yoyEnd = new Date(currentEnd);
    yoyEnd.setFullYear(yoyEnd.getFullYear() - 1);

    const { data: yoyData, error: yoyErr } = await supabase
      .from("transactions")
      .select("id, amount, category_name, created_at, type")
      .is("deleted_at", null)
      .eq("type", "expense")
      .gte("created_at", yoyStart.toISOString())
      .lte("created_at", yoyEnd.toISOString())
      .order("created_at", { ascending: false });

    if (yoyErr) {
      return NextResponse.json({ error: yoyErr.message }, { status: 500 });
    }

    let comparisonTransactions: CpiTransaction[] = (yoyData ||
      []) as CpiTransaction[];
    let periodMode: "yoy" | "baseline" = "yoy";
    let previousPeriodLabel = yoyStart.toLocaleDateString("uk-UA", {
      month: "long",
      year: "numeric",
    });

    // 4. Якщо даних за минулий рік ще немає (< 12 місяців обліку), беремо стартовий базовий період (перші 30 днів обліку)
    if (!comparisonTransactions.length) {
      const { data: earliestTx } = await supabase
        .from("transactions")
        .select("created_at")
        .is("deleted_at", null)
        .eq("type", "expense")
        .order("created_at", { ascending: true })
        .limit(1);

      if (earliestTx && earliestTx.length > 0) {
        const baseStart = new Date(earliestTx[0].created_at);
        const baseEnd = new Date(
          baseStart.getTime() + 30 * 24 * 60 * 60 * 1000
        ); // перші 30 днів

        const { data: baseData } = await supabase
          .from("transactions")
          .select("id, amount, category_name, created_at, type")
          .is("deleted_at", null)
          .eq("type", "expense")
          .gte("created_at", baseStart.toISOString())
          .lte("created_at", baseEnd.toISOString())
          .order("created_at", { ascending: false });

        if (baseData && baseData.length > 0) {
          comparisonTransactions = baseData as CpiTransaction[];
          periodMode = "baseline";
          previousPeriodLabel = `Базовий період (${baseStart.toLocaleDateString("uk-UA", { month: "short", year: "numeric" })})`;
        }
      }
    }

    // 5. Розрахунок звіту Personal CPI через чистий математичний модуль
    const report = calculatePersonalCpi(
      (currData || []) as CpiTransaction[],
      comparisonTransactions,
      {
        periodMode,
        currentPeriodLabel,
        previousPeriodLabel,
      }
    );

    return NextResponse.json(
      { cpi: report },
      {
        headers: {
          "Cache-Control": "private, s-maxage=300, stale-while-revalidate=600",
        },
      }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
