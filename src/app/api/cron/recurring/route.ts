import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (process.env.NODE_ENV === "production") {
      if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
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

    const { data: templates, error: templatesError } = await supabaseAdmin
      .from("recurring_templates")
      .select("*")
      .eq("is_active", true)
      .eq("day_of_month", currentDay);

    if (templatesError) throw templatesError;
    if (!templates || templates.length === 0) {
      return NextResponse.json({
        message: "No recurring expenses scheduled for today",
        processed: 0,
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

    const toInsert = templates
      .filter(
        (tmpl) => !existingMerchantsThisMonth.has(tmpl.title.toLowerCase())
      )
      .map((tmpl) => ({
        amount: tmpl.amount,
        currency: "UAH",
        merchant_raw: tmpl.title,
        category_name: tmpl.category_name,
        source: "recurring",
        type: "expense",
      }));

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
      inserted,
    });
  } catch (error: any) {
    console.error("Cron recurring execution error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
