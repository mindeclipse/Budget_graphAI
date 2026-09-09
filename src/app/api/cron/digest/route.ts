import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { timingSafeEqual } from "@/lib/security";
import { verifySessionToken } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  generateWeeklyDigest,
  generateCycleSummary,
} from "@/lib/telegram-digest";

export const dynamic = "force-dynamic";

async function isAuthorized(req: NextRequest): Promise<boolean> {
  // 1. Перевірка CRON_SECRET у заголовку Authorization
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (
    cronSecret &&
    authHeader &&
    timingSafeEqual(authHeader, `Bearer ${cronSecret}`)
  ) {
    return true;
  }

  // 2. Перевірка сесії користувача (для ручного тестування з інтерфейсу)
  const cookieStore = await cookies();
  const session = cookieStore.get("finance_session")?.value;
  const { valid } = await verifySessionToken(session);
  if (valid) {
    return true;
  }

  // У середовищі розробки без секретів дозволяємо запуск
  if (process.env.NODE_ENV !== "production" && !cronSecret) {
    return true;
  }

  return false;
}

export async function GET(req: NextRequest) {
  try {
    if (!(await isAuthorized(req))) {
      return NextResponse.json(
        {
          error:
            "Доступ заборонено: недійсний CRON токен або відсутня активна сесія",
        },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type"); // "weekly" | "cycle" | null
    const force = searchParams.get("force") === "true";
    const cycleId = searchParams.get("cycleId") || undefined;

    // Ручний запуск щотижневого дайджесту
    if (type === "weekly") {
      const result = await generateWeeklyDigest({ force });
      return NextResponse.json({
        type: "weekly",
        ...result,
      });
    }

    // Ручний запуск підсумку циклу
    if (type === "cycle") {
      const result = await generateCycleSummary(cycleId, { force });
      return NextResponse.json({
        type: "cycle",
        ...result,
      });
    }

    // Автоматичний плановий запуск (Vercel Cron)
    const now = new Date();
    const kyivDay = new Intl.DateTimeFormat("en-US", {
      timeZone: "Europe/Kyiv",
      weekday: "short",
    }).format(now);

    const executedActions: string[] = [];

    // 1. Щонеділі ввечері — щотижневий дайджест
    if (kyivDay === "Sun" || force) {
      const weeklyRes = await generateWeeklyDigest({ force });
      if (weeklyRes.sent) {
        executedActions.push("weekly_digest_sent");
      }
    }

    // 2. Перевірка завершення розрахункового циклу
    const supabase = getSupabaseAdmin();
    const { data: activeCycle } = await supabase
      .from("budget_cycles")
      .select("id, start_date, end_date, is_active")
      .eq("is_active", true)
      .maybeSingle();

    if (activeCycle) {
      const cycleStart = new Date(activeCycle.start_date);
      const cycleEnd = activeCycle.end_date
        ? new Date(activeCycle.end_date)
        : new Date(cycleStart.getTime() + 30 * 24 * 60 * 60 * 1000);

      // Якщо цикл закінчується сьогодні або вже минув термін
      if (now >= cycleEnd) {
        const cycleRes = await generateCycleSummary(activeCycle.id, { force });
        if (cycleRes.sent) {
          executedActions.push(`cycle_summary_sent_${activeCycle.id}`);
        }
      }
    }

    return NextResponse.json({
      success: true,
      executedActions:
        executedActions.length > 0 ? executedActions : "none_scheduled_for_now",
      kyivDay,
    });
  } catch (error: any) {
    console.error("[Cron Digest Error]:", error);
    return NextResponse.json(
      {
        error:
          process.env.NODE_ENV === "production"
            ? "Помилка формування регулярного дайджесту"
            : error?.message,
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  // Для сумісності підтримуємо і POST метод (наприклад, для виклику з UI action)
  return GET(req);
}
