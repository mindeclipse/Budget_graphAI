import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { verifySessionToken } from "@/lib/session";

import { generateBackupData } from "@/lib/backup-service";

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

    const backupPayload = await generateBackupData();

    return new Response(JSON.stringify(backupPayload, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="budgetgraph-backup-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    });
  } catch (err: any) {
    console.error("[API backup GET error]:", err);
    return NextResponse.json(
      { error: getSafeErrorMessage(err) },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    if (!(await checkAuthSession())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = await req.json();
    const data = payload.data || payload;

    if (!data || typeof data !== "object") {
      return NextResponse.json(
        { error: "Некоректний формат файлу бекапу" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    const restoredSummary: Record<string, number> = {};

    // 1. Відновлення категорійних лімітів (upsert by category_name)
    if (
      Array.isArray(data.category_budgets) &&
      data.category_budgets.length > 0
    ) {
      const { error } = await supabase
        .from("category_budgets")
        .upsert(data.category_budgets, { onConflict: "category_name" });
      if (!error)
        restoredSummary.category_budgets = data.category_budgets.length;
    }

    // 2. Відновлення правил мерчантів (upsert by pattern, сумісність з clean_merchant)
    if (Array.isArray(data.merchant_rules) && data.merchant_rules.length > 0) {
      const sanitizedRules = data.merchant_rules.map((r: any) => ({
        pattern: String(r.pattern || "")
          .trim()
          .toLowerCase(),
        clean_merchant: (
          r.clean_merchant ||
          r.normalized_name ||
          r.pattern ||
          ""
        ).trim(),
        category_name: String(r.category_name || "Інше").trim(),
      }));
      const { error } = await supabase
        .from("merchant_rules")
        .upsert(sanitizedRules, { onConflict: "pattern" });
      if (!error) restoredSummary.merchant_rules = data.merchant_rules.length;
    }

    // 3. Відновлення регулярних платежів
    if (
      Array.isArray(data.recurring_templates) &&
      data.recurring_templates.length > 0
    ) {
      const { error } = await supabase
        .from("recurring_templates")
        .upsert(data.recurring_templates, { onConflict: "id" });
      if (!error)
        restoredSummary.recurring_templates = data.recurring_templates.length;
    }

    // 4. Відновлення скарбничок
    if (Array.isArray(data.savings_goals) && data.savings_goals.length > 0) {
      const { error } = await supabase
        .from("savings_goals")
        .upsert(data.savings_goals, { onConflict: "id" });
      if (!error) restoredSummary.savings_goals = data.savings_goals.length;
    }

    // 5. Відновлення інвестицій
    if (Array.isArray(data.investments) && data.investments.length > 0) {
      const { error } = await supabase
        .from("investments")
        .upsert(data.investments, { onConflict: "id" });
      if (!error) restoredSummary.investments = data.investments.length;
    }

    // 6. Відновлення циклів бюджету
    if (Array.isArray(data.budget_cycles) && data.budget_cycles.length > 0) {
      const { error } = await supabase
        .from("budget_cycles")
        .upsert(data.budget_cycles, { onConflict: "id" });
      if (!error) restoredSummary.budget_cycles = data.budget_cycles.length;
    }

    // 7. Відновлення транзакцій
    if (Array.isArray(data.transactions) && data.transactions.length > 0) {
      const { error } = await supabase
        .from("transactions")
        .upsert(data.transactions, { onConflict: "id" });
      if (!error) restoredSummary.transactions = data.transactions.length;
    }

    // 8. Відновлення листа бажань (wishlist_items)
    if (Array.isArray(data.wishlist_items) && data.wishlist_items.length > 0) {
      const { error } = await supabase
        .from("wishlist_items")
        .upsert(data.wishlist_items, { onConflict: "id" });
      if (!error) restoredSummary.wishlist_items = data.wishlist_items.length;
    }

    // 9. Відновлення вартості за використання (cost_per_use_items)
    if (
      Array.isArray(data.cost_per_use_items) &&
      data.cost_per_use_items.length > 0
    ) {
      const { error } = await supabase
        .from("cost_per_use_items")
        .upsert(data.cost_per_use_items, { onConflict: "id" });
      if (!error)
        restoredSummary.cost_per_use_items = data.cost_per_use_items.length;
    }

    return NextResponse.json({
      success: true,
      message: "Дані успішно відновлено",
      restored: restoredSummary,
    });
  } catch (err: any) {
    console.error("[API backup POST error]:", err);
    return NextResponse.json(
      { error: getSafeErrorMessage(err) },
      { status: 500 }
    );
  }
}
