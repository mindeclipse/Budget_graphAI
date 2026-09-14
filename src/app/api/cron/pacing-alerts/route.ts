import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { timingSafeEqual } from "@/lib/security";
import { verifySessionToken } from "@/lib/session";
import {
  generateFridayRadarAlert,
  generateMondayResetAlert,
  validateCronAuthorization,
} from "@/lib/pacing-alerts";

export const dynamic = "force-dynamic";

async function isAuthorized(req: NextRequest): Promise<boolean> {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (validateCronAuthorization(authHeader, cronSecret)) {
    return true;
  }

  // 2. Перевірка сесії користувача (для ручного запуску з інтерфейсу)
  try {
    const cookieStore = await cookies();
    const session = cookieStore.get("finance_session")?.value;
    const { valid } = await verifySessionToken(session);
    if (valid) {
      return true;
    }
  } catch {
    // В тестовому середовищі без контексту Next.js cookies() може викидати помилку
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
    const type = searchParams.get("type"); // "friday" | "monday" | null
    const force = searchParams.get("force") === "true";

    // Ручний виклик конкретного типу сповіщення
    if (type === "friday") {
      const result = await generateFridayRadarAlert({ force });
      return NextResponse.json(result);
    }

    if (type === "monday") {
      const result = await generateMondayResetAlert({ force });
      return NextResponse.json(result);
    }

    // Автоматичний плановий запуск (Vercel Cron)
    const now = new Date();
    const kyivDay = new Intl.DateTimeFormat("en-US", {
      timeZone: "Europe/Kyiv",
      weekday: "short",
    }).format(now);

    const executedActions: string[] = [];

    // П'ятниця: Friday Weekend Radar
    if (kyivDay === "Fri" || force) {
      const fridayRes = await generateFridayRadarAlert({ force, now });
      if (fridayRes.sent) {
        executedActions.push("friday_radar_sent");
      }
    }

    // Понеділок: Monday Runway Reset
    if (kyivDay === "Mon" || force) {
      const mondayRes = await generateMondayResetAlert({ force, now });
      if (mondayRes.sent) {
        executedActions.push("monday_reset_sent");
      }
    }

    return NextResponse.json({
      success: true,
      executedActions:
        executedActions.length > 0 ? executedActions : "none_scheduled_for_now",
      kyivDay,
    });
  } catch (error: any) {
    console.error("[Cron Pacing Alerts Error]:", error);
    return NextResponse.json(
      {
        error:
          process.env.NODE_ENV === "production"
            ? "Помилка відправки регулярного сповіщення темпу"
            : error?.message,
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
