import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getClientIp, timingSafeEqual } from "@/lib/security";
import { checkAiRateLimit } from "@/lib/rate-limiter";
import { inputSchema } from "./schemas";
import { classifyMerchant } from "./service";
import {
  formatQuickSummary,
  computeSafeDailyBudget,
} from "@/lib/classify-formatter";
import { checkDailyBudgetThreshold } from "@/lib/budget-alerts";
import { processExpenseRoundup } from "@/lib/roundup-utils";

export async function POST(req: NextRequest) {
  try {
    // 1. Внутрішня перевірка Bearer-токена (Defense-in-Depth)
    const authHeader = req.headers.get("authorization");
    const secretKey = process.env.APP_API_SECRET;

    if (
      !secretKey ||
      !authHeader ||
      !timingSafeEqual(authHeader, `Bearer ${secretKey}`)
    ) {
      return NextResponse.json(
        { error: "Unauthorized: Invalid or missing Bearer token" },
        { status: 401 }
      );
    }

    // 2. Захист квоти Gemini від зациклених викликів (макс. 60 / хв)
    const ip = getClientIp(req.headers);
    const rateLimit = checkAiRateLimit(`ai_classify_${ip}`, 60, 60 * 1000);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: `Забагато запитів класифікації. Зачекайте ${rateLimit.retryAfterSeconds} с.`,
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(rateLimit.retryAfterSeconds || 60),
          },
        }
      );
    }

    const body = await req.json();

    // Підтримуємо обидва формати назви поля
    const rawMerchant = body.merchant_raw || body.rawMerchant;
    const rawAmount = body.amount;
    const parsedAmount =
      typeof rawAmount === "number"
        ? rawAmount
        : parseFloat(String(rawAmount || "0").replace(",", "."));

    const validationResult = inputSchema.safeParse({
      rawMerchant,
      amount: parsedAmount,
      currency: body.currency || "UAH",
      source: body.source || "apple_pay",
      type: body.type || "expense",
    });

    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: "Помилка валідації даних",
          details: validationResult.error.format(),
        },
        { status: 400 }
      );
    }

    const {
      rawMerchant: validMerchant,
      amount,
      currency,
      source,
      type,
    } = validationResult.data;

    const supabaseAdmin = getSupabaseAdmin();

    // Багатоешелонна класифікація: Евристики ➔ Правила в БД ➔ Gemini AI
    const { cleanTitle, categoryName, classificationSource, cleaned } =
      await classifyMerchant(supabaseAdmin, validMerchant, amount);

    // Фіксація транзакції в таблиці transactions
    const { data: insertedTx, error: insertError } = await supabaseAdmin
      .from("transactions")
      .insert({
        amount,
        currency,
        merchant_raw: cleanTitle || cleaned || rawMerchant,
        category_name: categoryName,
        source,
        type,
        created_at: new Date().toISOString(),
        exclude_from_budget: false,
        metadata: {
          raw_merchant: rawMerchant,
          classification_source: classificationSource,
        },
      })
      .select()
      .single();

    if (insertError) {
      console.error("Supabase insert error:", insertError);
      throw new Error(`Помилка запису транзакції`);
    }

    // Паралельний розрахунок автоокруглення та щоденного ліміту
    const [roundupResult, dailyBudget] = await Promise.all([
      type === "expense" && currency === "UAH"
        ? processExpenseRoundup(supabaseAdmin, {
            parentTxId: insertedTx.id,
            amount,
            currency,
            source,
          }).catch((roundupErr) => {
            console.error("Auto-roundup failed gracefully:", roundupErr);
            return null;
          })
        : Promise.resolve(null),
      computeSafeDailyBudget(supabaseAdmin).catch((budgetErr) => {
        console.error("computeSafeDailyBudget failed gracefully:", budgetErr);
        return null;
      }),
    ]);

    const quickSummary = formatQuickSummary(
      cleanTitle,
      amount,
      categoryName,
      dailyBudget,
      roundupResult?.roundupAmount
    );

    // Перевірка денного ліміту для Telegram з надійним await
    if (type === "expense" && dailyBudget) {
      try {
        await checkDailyBudgetThreshold(undefined, undefined, dailyBudget);
      } catch (alertErr) {
        console.error("[Classify API] Daily budget alert error:", alertErr);
      }
    }

    // Повертаємо розширену відповідь для Apple Shortcuts
    return NextResponse.json({
      success: true,
      id: insertedTx.id,
      cleanTitle,
      categoryName,
      amount,
      currency,
      source: classificationSource,
      safeDailyRemaining: dailyBudget?.todayRemaining ?? null,
      todayRemaining: dailyBudget?.todayRemaining ?? null,
      todayTarget: dailyBudget?.todayTarget ?? null,
      todaySpent: dailyBudget?.todaySpent ?? null,
      cycleRemaining: dailyBudget?.cycleRemaining ?? null,
      daysRemaining: dailyBudget?.daysRemaining ?? null,
      quickSummary,
      roundup: roundupResult
        ? {
            amount: roundupResult.roundupAmount,
            currency: "UAH",
            goalName: roundupResult.goalName,
            transactionId: roundupResult.roundupTxId,
            newGoalBalance: roundupResult.newGoalBalance,
          }
        : null,
    });
  } catch (error: any) {
    console.error("Classify & Ingest API error:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          process.env.NODE_ENV === "production"
            ? "Помилка обробки транзакції"
            : error.message || "Помилка обробки транзакції",
      },
      { status: 500 }
    );
  }
}
