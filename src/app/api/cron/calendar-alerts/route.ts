import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { timingSafeEqual } from "@/lib/security";
import { verifySessionToken } from "@/lib/session";
import { sendTelegramMessage } from "@/lib/telegram";

export const dynamic = "force-dynamic";

async function isAuthorized(req: NextRequest): Promise<boolean> {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (
    cronSecret &&
    authHeader &&
    timingSafeEqual(authHeader, `Bearer ${cronSecret}`)
  ) {
    return true;
  }

  // Перевірка активної сесії для тестування з інтерфейсу або браузера
  try {
    const cookieStore = await cookies();
    const session = cookieStore.get("finance_session")?.value;
    const { valid } = await verifySessionToken(session);
    if (valid) return true;
  } catch {
    // ignore
  }

  // Якщо локальне середовище розробки і cronSecret не налаштовано — дозволити для тестів
  if (process.env.NODE_ENV !== "production" && !cronSecret) {
    return true;
  }

  return false;
}

function formatUah(amount: number): string {
  return amount.toLocaleString("uk-UA");
}

export async function GET(req: NextRequest) {
  try {
    if (!(await isAuthorized(req))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const force = searchParams.get("force") === "true";

    const supabaseAdmin = getSupabaseAdmin();

    // Сьогоднішня дата в локальному часі (Kyiv)
    const now = new Date();
    const kyivIso = now.toLocaleDateString("en-CA", {
      timeZone: "Europe/Kyiv",
    }); // "YYYY-MM-DD"
    const todayIso = kyivIso;
    const [kyivYear, kyivMonth, kyivDay] = kyivIso.split("-").map(Number);
    const today = new Date(kyivYear, kyivMonth - 1, kyivDay);

    // Розраховуємо цільові дати: 0 (сьогодні), 1 (завтра), 3, 7 днів
    const targetDays = [0, 1, 3, 7];
    const dateMap = new Map<number, string>();
    targetDays.forEach((days) => {
      const d = new Date(today);
      d.setDate(d.getDate() + days);
      const dy = d.getFullYear();
      const dm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      dateMap.set(days, `${dy}-${dm}-${dd}`);
    });

    const maxHorizonIso = dateMap.get(7)!;

    // Паралельні запити до бази
    const [cycleRes, recurringRes, investRes, customEventsRes] =
      await Promise.all([
        supabaseAdmin
          .from("budget_cycles")
          .select("id, name, start_date, end_date, budget_limit, is_active")
          .eq("is_active", true)
          .maybeSingle(),
        supabaseAdmin
          .from("recurring_templates")
          .select(
            "id, title, amount, currency, category_name, day_of_month, is_active"
          )
          .eq("is_active", true),
        supabaseAdmin
          .from("investments")
          .select(
            "id, asset_name, asset_type, invested_amount, current_value, currency, yield_percent, maturity_date, notes"
          ),
        supabaseAdmin
          .from("financial_events")
          .select("*")
          .eq("is_completed", false),
      ]);

    const activeCycle = cycleRes.data;
    const recurringList = recurringRes.data || [];
    const investmentsList = investRes.data || [];
    const customEventsList = customEventsRes.data || [];

    interface AlertItem {
      daysRemaining: number;
      category: "cycle" | "recurring" | "investment" | "custom";
      title: string;
      amount?: number | null;
      currency?: string;
      type: "expense" | "income" | "reminder";
    }

    const foundAlerts: AlertItem[] = [];
    const notifiedCustomEventIds: number[] = [];

    // 1. Перевірка завершення активного циклу
    if (activeCycle?.end_date) {
      const endDate = new Date(activeCycle.end_date);
      const diffMs = endDate.getTime() - new Date(todayIso).getTime();
      const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

      if (targetDays.includes(diffDays)) {
        foundAlerts.push({
          daysRemaining: diffDays,
          category: "cycle",
          title: `Кінець розрахункового циклу «${activeCycle.name}»`,
          type: "reminder",
        });
      }
    }

    // 2. Перевірка регулярних платежів
    targetDays.forEach((days) => {
      const targetDate = new Date(today);
      targetDate.setDate(targetDate.getDate() + days);
      const dayOfMonth = targetDate.getDate();

      recurringList.forEach((tmpl) => {
        if (tmpl.day_of_month === dayOfMonth) {
          foundAlerts.push({
            daysRemaining: days,
            category: "recurring",
            title: tmpl.title,
            amount: Number(tmpl.amount),
            currency: tmpl.currency || "UAH",
            type: "expense",
          });
        }
      });
    });

    // 3. Перевірка інвестицій (погашення чи виплати)
    investmentsList.forEach((inv) => {
      if (inv.maturity_date) {
        const matIso = inv.maturity_date.slice(0, 10);
        targetDays.forEach((days) => {
          if (dateMap.get(days) === matIso) {
            const isBonds = inv.asset_type === "bonds";
            const isDeposit = inv.asset_type === "deposit";
            const label = isBonds
              ? "Погашення ОВДП"
              : isDeposit
                ? "Повернення депозиту"
                : "Завершення інвестиції";

            foundAlerts.push({
              daysRemaining: days,
              category: "investment",
              title: `${label}: ${inv.asset_name}`,
              amount: Number(inv.current_value || inv.invested_amount),
              currency: inv.currency || "UAH",
              type: "income",
            });
          }
        });
      }

      // Щомісячні дивіденди Inzhur REIT (10 числа) або день з notes
      const isInzhur =
        inv.asset_type === "reit" ||
        inv.asset_name?.toLowerCase().includes("inzhur");

      let divDay: number | null = null;
      if (isInzhur) {
        divDay = 10;
      }
      const dayMatch = inv.notes?.match(/(\d{1,2})[-. ]*(числа|число|день)/i);
      if (dayMatch && dayMatch[1]) {
        const parsed = parseInt(dayMatch[1], 10);
        if (parsed >= 1 && parsed <= 31) divDay = parsed;
      }

      if (divDay) {
        targetDays.forEach((days) => {
          const tDate = new Date(today);
          tDate.setDate(tDate.getDate() + days);
          if (tDate.getDate() === divDay) {
            let monthlyYieldAmount: number | null = null;
            if (inv.yield_percent && inv.current_value) {
              monthlyYieldAmount = Math.round(
                (Number(inv.current_value) *
                  (Number(inv.yield_percent) / 100)) /
                  12
              );
            }
            foundAlerts.push({
              daysRemaining: days,
              category: "investment",
              title: `💰 Дивіденди: ${inv.asset_name}`,
              amount: monthlyYieldAmount,
              currency: inv.currency || "UAH",
              type: "income",
            });
          }
        });
      }
    });

    // 4. Перевірка кастомних подій (financial_events)
    customEventsList.forEach((ev) => {
      targetDays.forEach((days) => {
        const targetIso = dateMap.get(days);
        const notifySettings = Array.isArray(ev.notify_days_before)
          ? ev.notify_days_before
          : [7, 3, 1];

        // Якщо користувач підписався на сповіщення за 'days' днів або це сьогодні (days === 0)
        const shouldNotifyOnThisDay =
          days === 0 || notifySettings.includes(days);

        if (shouldNotifyOnThisDay) {
          let matches = false;
          if (ev.is_recurring) {
            const originalDay = parseInt(ev.event_date.slice(8, 10), 10);
            const targetDay = new Date(targetIso!).getDate();
            if (originalDay === targetDay) matches = true;
          } else {
            if (ev.event_date === targetIso) matches = true;
          }

          if (matches) {
            foundAlerts.push({
              daysRemaining: days,
              category: "custom",
              title: ev.title,
              amount: ev.amount ? Number(ev.amount) : null,
              currency: ev.currency || "UAH",
              type: ev.event_type as any,
            });
            notifiedCustomEventIds.push(ev.id);
          }
        }
      });
    });

    if (foundAlerts.length === 0 && !force) {
      return NextResponse.json({
        message: "Немає наближення фінансових подій для сповіщення сьогодні",
        alertsCount: 0,
      });
    }

    // Сортуємо: спочатку сьогодні, потім завтра, 3, 5, 7 днів
    foundAlerts.sort((a, b) => a.daysRemaining - b.daysRemaining);

    // Групуємо за днями
    const sections: Record<number, AlertItem[]> = {};
    foundAlerts.forEach((item) => {
      if (!sections[item.daysRemaining]) sections[item.daysRemaining] = [];
      sections[item.daysRemaining].push(item);
    });

    const getDayHeader = (days: number): string => {
      if (days === 0) return "🚨 <b>СЬОГОДНІ:</b>";
      if (days === 1) return "⏳ <b>ЗАВТРА (через 1 день):</b>";
      if (days === 3) return "🗓 <b>Через 3 дні:</b>";
      if (days === 7) return "📆 <b>Через 7 днів (тиждень):</b>";
      return `📌 <b>Через ${days} дн.:</b>`;
    };

    const messageLines: string[] = [
      "🔔 <b>Фінансовий радар наближення подій</b>\n",
    ];

    Object.keys(sections)
      .map(Number)
      .sort((a, b) => a - b)
      .forEach((days) => {
        messageLines.push(getDayHeader(days));
        sections[days].forEach((alert) => {
          let icon = "•";
          if (alert.category === "recurring") icon = "💳";
          if (alert.category === "investment") icon = "📈";
          if (alert.category === "cycle") icon = "🎯";
          if (alert.category === "custom") icon = "📌";

          let amountStr = "";
          if (alert.amount) {
            const prefix =
              alert.type === "expense"
                ? "-"
                : alert.type === "income"
                  ? "+"
                  : "";
            amountStr = ` (${prefix}${formatUah(alert.amount)} ${alert.currency || "₴"})`;
          }

          messageLines.push(`${icon} ${alert.title}${amountStr}`);
        });
        messageLines.push(""); // пустий рядок між секціями
      });

    const finalHtml = messageLines.join("\n").trim();
    const sent = await sendTelegramMessage(finalHtml);

    // Оновлюємо last_notified_at для надісланих подій
    if (sent && notifiedCustomEventIds.length > 0) {
      await supabaseAdmin
        .from("financial_events")
        .update({ last_notified_at: new Date().toISOString() })
        .in("id", notifiedCustomEventIds);
    }

    return NextResponse.json({
      success: true,
      sent,
      alertsCount: foundAlerts.length,
      alerts: foundAlerts,
    });
  } catch (error: any) {
    console.error("[API cron/calendar-alerts error]:", error);
    return NextResponse.json(
      { error: error?.message || "Помилка формування сповіщень" },
      { status: 500 }
    );
  }
}
