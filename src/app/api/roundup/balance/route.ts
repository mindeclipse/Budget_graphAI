import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { verifySessionToken } from "@/lib/session";
import { timingSafeEqual } from "@/lib/security";
import {
  calculateBalanceRounddown,
  ROUNDUP_DEFAULT_STEP,
  ROUNDUP_GOAL_NAME,
  ROUNDUP_CATEGORY_NAME,
  ROUNDUP_BALANCE_MERCHANT_PREFIX,
} from "@/lib/roundup-utils";
import { z } from "zod";

async function isAuthorized(req: NextRequest): Promise<boolean> {
  // 1. Bearer Token (Shortcuts / Cron)
  const authHeader = req.headers.get("authorization");
  const secretKey = process.env.APP_API_SECRET;
  if (
    secretKey &&
    authHeader &&
    timingSafeEqual(authHeader, `Bearer ${secretKey}`)
  ) {
    return true;
  }

  // 2. Cookie Session (Web UI)
  const cookieStore = await cookies();
  const session = cookieStore.get("finance_session")?.value;
  const { valid } = await verifySessionToken(session);
  return valid;
}

const balanceRoundupSchema = z.object({
  cardBalance: z
    .number()
    .positive("Баланс має бути більшим за нуль")
    .max(10_000_000, "Сума перевищує допустимий ліміт"),
  step: z.number().positive().max(1000).default(ROUNDUP_DEFAULT_STEP),
  goalName: z.string().trim().min(1).max(100).default(ROUNDUP_GOAL_NAME),
  source: z.string().trim().max(50).default("manual"),
});

export async function GET(req: NextRequest) {
  try {
    if (!(await isAuthorized(req))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getSupabaseAdmin();
    const { data: goal } = await supabase
      .from("savings_goals")
      .select("*")
      .ilike("name", `%${ROUNDUP_GOAL_NAME}%`)
      .maybeSingle();

    return NextResponse.json({
      roundupStep: ROUNDUP_DEFAULT_STEP,
      goalName: ROUNDUP_GOAL_NAME,
      goal: goal || null,
    });
  } catch (error: any) {
    console.error("[API roundup/balance GET error]:", error);
    return NextResponse.json(
      { error: "Помилка отримання даних автоокруглення" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!(await isAuthorized(req))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rawBody = await req.json();
    const parsed = balanceRoundupSchema.safeParse(rawBody);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { cardBalance, step, goalName, source } = parsed.data;
    const sweepAmount = calculateBalanceRounddown(cardBalance, step);

    if (sweepAmount <= 0) {
      return NextResponse.json({
        success: true,
        sweepAmount: 0,
        message: `Баланс (${cardBalance.toFixed(2)} ₴) вже округлений до ${step} ₴.`,
      });
    }

    const supabase = getSupabaseAdmin();
    const merchantRaw = `${ROUNDUP_BALANCE_MERCHANT_PREFIX}${goalName}`;

    // 1. Створюємо переказ округлення залишку в transactions
    const { data: tx, error: txErr } = await supabase
      .from("transactions")
      .insert({
        amount: sweepAmount,
        currency: "UAH",
        merchant_raw: merchantRaw,
        category_name: ROUNDUP_CATEGORY_NAME,
        source,
        type: "transfer",
        created_at: new Date().toISOString(),
        exclude_from_budget: false,
      })
      .select()
      .single();

    if (txErr) {
      console.error("[API roundup/balance POST tx error]:", txErr);
      throw new Error("Не вдалося створити транзакцію округлення залишку");
    }

    // 2. Оновлюємо скарбничку у savings_goals
    let newGoalBalance = sweepAmount;
    const { data: existingGoal } = await supabase
      .from("savings_goals")
      .select("id, current_amount")
      .ilike("name", `%${goalName}%`)
      .maybeSingle();

    if (existingGoal) {
      newGoalBalance =
        Math.round(
          (Number(existingGoal.current_amount || 0) + sweepAmount) * 100
        ) / 100;
      await supabase
        .from("savings_goals")
        .update({ current_amount: newGoalBalance })
        .eq("id", existingGoal.id);
    } else {
      await supabase.from("savings_goals").insert({
        name: goalName,
        current_amount: sweepAmount,
        currency: "UAH",
        target_amount: null,
      });
    }

    const newCardBalance = Math.round((cardBalance - sweepAmount) * 100) / 100;

    return NextResponse.json({
      success: true,
      sweepAmount,
      newCardBalance,
      goalName,
      newGoalBalance,
      transactionId: tx.id,
    });
  } catch (error: any) {
    console.error("[API roundup/balance POST error]:", error);
    return NextResponse.json(
      {
        error:
          process.env.NODE_ENV === "production"
            ? "Помилка обробки округлення залишку"
            : error.message || "Помилка сервера",
      },
      { status: 500 }
    );
  }
}
