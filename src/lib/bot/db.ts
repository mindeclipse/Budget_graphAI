import { CategoryType } from "@/constants/categories";
import {
  computeSafeDailyBudget,
  DailyBudgetInfo,
} from "@/lib/classify-formatter";
import { processExpenseRoundup } from "@/lib/roundup-utils";
import { checkDailyBudgetThreshold } from "@/lib/budget-alerts";

/**
 * Записує транзакцію в Supabase та обробляє автоокруглення й сповіщення
 */
export async function recordTelegramTransaction(
  supabaseAdmin: any,
  params: {
    amount: number;
    currency?: string;
    merchant: string;
    category: CategoryType;
    type: "expense" | "income" | "investment";
    date?: string;
    exclude_from_budget?: boolean;
    tags?: string[];
    metadata?: Record<string, any>;
  }
): Promise<{
  transaction: any;
  dailyBudget: DailyBudgetInfo | null;
  roundupResult: any;
}> {
  const currency = params.currency || "UAH";
  const createdAt = params.date || new Date().toISOString();
  const excludeFromBudget = Boolean(params.exclude_from_budget);

  // 1. Вставка в transactions
  const { data: transaction, error } = await supabaseAdmin
    .from("transactions")
    .insert({
      amount: params.amount,
      currency,
      merchant_raw: params.merchant,
      category_name: params.category,
      source: "telegram_bot",
      type: params.type,
      created_at: createdAt,
      exclude_from_budget: excludeFromBudget,
      tags: params.tags || [],
      metadata: params.metadata || {},
    })
    .select()
    .single();

  if (error || !transaction) {
    console.error("[Telegram Bot] Supabase insert transaction error:", error);
    throw new Error("Не вдалося зберегти транзакцію в базі даних");
  }

  // 2. Автоокруглення витрати на Фінансову подушку (тільки для звичайних витрат з бюджету)
  let roundupResult = null;
  if (params.type === "expense" && currency === "UAH" && !excludeFromBudget) {
    try {
      roundupResult = await processExpenseRoundup(supabaseAdmin, {
        parentTxId: transaction.id,
        amount: params.amount,
        currency,
        source: "telegram_bot",
      });
    } catch (roundupErr) {
      console.error("[Telegram Bot] Auto-roundup error:", roundupErr);
    }
  }

  // 3. Розрахунок щоденного бюджету
  let dailyBudget: DailyBudgetInfo | null = null;
  try {
    dailyBudget = await computeSafeDailyBudget(supabaseAdmin);
  } catch (budgetErr) {
    console.error("[Telegram Bot] Safe daily budget error:", budgetErr);
  }

  // 4. Перевірка перевищення денного ліміту (тільки якщо витрата враховується в бюджеті)
  if (params.type === "expense" && !excludeFromBudget) {
    checkDailyBudgetThreshold(undefined, undefined, dailyBudget).catch(
      (err) => {
        console.error("[Telegram Bot] Daily budget threshold error:", err);
      }
    );
  }

  return {
    transaction,
    dailyBudget,
    roundupResult,
  };
}
