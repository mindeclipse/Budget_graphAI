import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getCategoryByMcc } from "@/lib/mcc-mapper";
import { checkDailyBudgetThreshold } from "@/lib/budget-alerts";

export const dynamic = "force-dynamic";

// 1. Необхідно для успішної реєстрації вебхука в Monobank API
export async function GET() {
  return NextResponse.json({ status: "ok" });
}

// 2. Обробка вхідних транзакцій від банку
export async function POST(req: Request) {
  try {
    const body = await req.json();

    // Перевіряємо тип повідомлення: Monobank надсилає "StatementItem"
    if (body.type !== "StatementItem" || !body.data?.statementItem) {
      return NextResponse.json({ received: true });
    }

    const item = body.data.statementItem;
    const accountId = body.data.account;

    // Фільтрація за карткою (за потреби можна обмежити конкретним accountId)
    const rawAmount = Number(item.amount);
    if (!rawAmount || isNaN(rawAmount)) {
      return NextResponse.json({ received: true });
    }

    // Monobank передає суми в копійках: ділимо на 100
    const finalAmount = Math.abs(rawAmount) / 100;
    const isExpense = rawAmount < 0;
    const transactionType = isExpense ? "expense" : "income";

    const merchantName = item.description?.trim() || "Monobank операція";
    const categoryName = getCategoryByMcc(item.mcc);
    const externalId = `mono_${item.id}`;

    // Час транзакції передається як Unix timestamp в секундах
    const transactionDate = new Date(item.time * 1000).toISOString();

    const supabaseAdmin = getSupabaseAdmin();

    // Запис у базу із захистом від дублікатів (upsert по external_id)
    const { data: inserted, error } = await supabaseAdmin
      .from("transactions")
      .upsert(
        {
          external_id: externalId,
          amount: finalAmount,
          currency: "UAH",
          merchant_raw: merchantName,
          category_name: categoryName,
          source: "monobank",
          type: transactionType,
          created_at: transactionDate,
        },
        { onConflict: "external_id", ignoreDuplicates: true }
      )
      .select("id")
      .maybeSingle();

    if (error) {
      console.error("[Monobank Webhook] Supabase insert error:", error);
    }

    // Якщо це нова витрата — запускаємо перевірку ліміту та Telegram-алерт
    if (isExpense && inserted) {
      await checkDailyBudgetThreshold().catch((err) => {
        console.error("[Monobank Webhook] Budget alert error:", err);
      });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[Monobank Webhook] Handling error:", error);
    // Завжди повертаємо 200, щоб Monobank не повторював запит циклічно
    return NextResponse.json({ received: true });
  }
}
