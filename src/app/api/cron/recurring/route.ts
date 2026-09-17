import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getUsdRate } from "@/lib/currency";

import { timingSafeEqual } from "@/lib/security";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (process.env.NODE_ENV === "production" || cronSecret) {
      if (
        !cronSecret ||
        !authHeader ||
        !timingSafeEqual(authHeader, `Bearer ${cronSecret}`)
      ) {
        return NextResponse.json(
          { error: "Unauthorized cron trigger" },
          { status: 401 }
        );
      }
    }

    const today = new Date();
    const currentDay = today.getDate();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();

    const startOfMonth = new Date(currentYear, currentMonth, 1).toISOString();
    const endOfMonth = new Date(
      currentYear,
      currentMonth + 1,
      0,
      23,
      59,
      59,
      999
    ).toISOString();

    const supabaseAdmin = getSupabaseAdmin();

    // 1. Автоматичне очищення кошика: остаточне видалення транзакцій, які перебувають у кошику понад 10 днів
    const tenDaysAgo = new Date(
      Date.now() - 10 * 24 * 60 * 60 * 1000
    ).toISOString();
    let purgedTrashCount = 0;
    try {
      const { data: purgedData, error: purgeError } = await supabaseAdmin
        .from("transactions")
        .delete()
        .not("deleted_at", "is", null)
        .lt("deleted_at", tenDaysAgo)
        .select("id");

      if (!purgeError && purgedData) {
        purgedTrashCount = purgedData.length;
        if (purgedTrashCount > 0) {
          console.log(
            `[Cron recurring] Автоматично очищено з кошика ${purgedTrashCount} транзакцій (>10 днів)`
          );
        }
      }
    } catch (trashErr) {
      console.warn(
        "[Cron recurring] Trash purge check skipped or failed:",
        trashErr
      );
    }

    const { data: templates, error: templatesError } = await supabaseAdmin
      .from("recurring_templates")
      .select(
        "id, title, amount, currency, category_name, day_of_month, is_active"
      )
      .eq("is_active", true)
      .eq("day_of_month", currentDay);

    if (templatesError) throw templatesError;
    if (!templates || templates.length === 0) {
      return NextResponse.json({
        message: "No recurring expenses scheduled for today",
        processed: 0,
        purgedTrashCount,
      });
    }

    const { data: existingTransactions, error: txError } = await supabaseAdmin
      .from("transactions")
      .select("merchant_raw, created_at")
      .eq("source", "recurring")
      .gte("created_at", startOfMonth)
      .lte("created_at", endOfMonth);

    if (txError) throw txError;

    const existingMerchantsThisMonth = new Set(
      (existingTransactions || []).map((t) => t.merchant_raw.toLowerCase())
    );

    // Отримуємо курс, якщо хоча б одна підписка на сьогодні у USD
    const hasUsd = templates.some((t) => t.currency === "USD");
    const usdRate = hasUsd ? await getUsdRate() : 1;

    const toInsert = templates
      .filter(
        (tmpl) => !existingMerchantsThisMonth.has(tmpl.title.toLowerCase())
      )
      .map((tmpl) => {
        const isUsd = tmpl.currency === "USD";
        const finalAmount = isUsd
          ? Math.round(Number(tmpl.amount) * usdRate)
          : Number(tmpl.amount);

        return {
          amount: finalAmount,
          currency: "UAH",
          merchant_raw: isUsd ? `${tmpl.title} ($${tmpl.amount})` : tmpl.title,
          category_name: tmpl.category_name,
          source: "recurring",
          type: "expense",
        };
      });

    if (toInsert.length === 0) {
      return NextResponse.json({
        message: "All scheduled expenses already recorded this month",
        processed: 0,
      });
    }

    const { data: inserted, error: insertError } = await supabaseAdmin
      .from("transactions")
      .insert(toInsert)
      .select();

    if (insertError) throw insertError;

    return NextResponse.json({
      success: true,
      processed: inserted.length,
      usdRate: hasUsd ? usdRate : null,
      inserted,
    });
  } catch (error: any) {
    console.error("Cron recurring execution error:", error);
    return NextResponse.json(
      {
        error:
          process.env.NODE_ENV === "production"
            ? "Помилка виконання запланованого завдання"
            : error.message,
      },
      { status: 500 }
    );
  }
}
