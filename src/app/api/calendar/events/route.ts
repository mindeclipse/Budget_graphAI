import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { verifySessionToken } from "@/lib/session";
import {
  financialEventCreateSchema,
  financialEventUpdateSchema,
} from "@/lib/validations";
import { CalendarTimelineItem, FinancialEvent } from "@/types/finance";

export const dynamic = "force-dynamic";

async function checkAuthSession(): Promise<boolean> {
  const cookieStore = await cookies();
  const session = cookieStore.get("finance_session")?.value;
  const { valid } = await verifySessionToken(session);
  return valid;
}

function getSafeErrorMessage(error: any): string {
  return process.env.NODE_ENV === "production"
    ? "Помилка обробки запиту календаря"
    : error?.message || "Помилка сервера";
}

/**
 * Отримує всі події для календаря (межі циклу, підписки, виплати інвестицій, кастомні події)
 */
export async function GET(req: NextRequest) {
  try {
    if (!(await checkAuthSession())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const now = new Date();
    const targetMonthStr = searchParams.get("month"); // 'YYYY-MM'

    let year = now.getFullYear();
    let month = now.getMonth(); // 0-indexed

    if (targetMonthStr && /^\d{4}-\d{2}$/.test(targetMonthStr)) {
      const [y, m] = targetMonthStr.split("-").map(Number);
      year = y;
      month = m - 1;
    }

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const monthPaddedStr = String(month + 1).padStart(2, "0");
    const startIsoDate = `${year}-${monthPaddedStr}-01`;
    const endIsoDate = `${year}-${monthPaddedStr}-${String(daysInMonth).padStart(2, "0")}`;

    const supabaseAdmin = getSupabaseAdmin();

    // Паралельний запит до БД
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
          .order("event_date", { ascending: true }),
      ]);

    const timelineItems: CalendarTimelineItem[] = [];

    // 1. Межі активного циклу
    const activeCycle = cycleRes.data;
    if (activeCycle) {
      if (
        activeCycle.start_date >= startIsoDate &&
        activeCycle.start_date <= endIsoDate
      ) {
        timelineItems.push({
          id: `cycle-start-${activeCycle.id}`,
          title: `🏁 Початок циклу «${activeCycle.name}»`,
          date: activeCycle.start_date,
          source: "cycle",
          type: "cycle_boundary",
          amount: activeCycle.budget_limit,
          currency: "UAH",
          metadata: { limit: activeCycle.budget_limit },
        });
      }

      if (
        activeCycle.end_date &&
        activeCycle.end_date >= startIsoDate &&
        activeCycle.end_date <= endIsoDate
      ) {
        timelineItems.push({
          id: `cycle-end-${activeCycle.id}`,
          title: `🎯 Фініш циклу «${activeCycle.name}»`,
          date: activeCycle.end_date,
          source: "cycle",
          type: "cycle_boundary",
          currency: "UAH",
        });
      }
    }

    // 2. Регулярні платежі & підписки
    const recurringList = recurringRes.data || [];
    recurringList.forEach((tmpl) => {
      // Обмежуємо день, якщо в місяці менше днів
      const day = Math.min(Math.max(1, tmpl.day_of_month || 1), daysInMonth);
      const dayPadded = String(day).padStart(2, "0");
      const monthPadded = String(month + 1).padStart(2, "0");
      const itemDate = `${year}-${monthPadded}-${dayPadded}`;

      timelineItems.push({
        id: `recurring-${tmpl.id}`,
        title: tmpl.title,
        date: itemDate,
        source: "recurring",
        type: "expense",
        amount: Number(tmpl.amount),
        currency: tmpl.currency || "UAH",
        metadata: {
          category: tmpl.category_name,
          dayOfMonth: tmpl.day_of_month,
        },
      });
    });

    // 3. Інвестиції (ОВДП, депозити, Інжур)
    const investmentsList = investRes.data || [];
    investmentsList.forEach((inv) => {
      // Погашення за maturity_date
      if (inv.maturity_date) {
        const matDate = inv.maturity_date.slice(0, 10);
        if (matDate >= startIsoDate && matDate <= endIsoDate) {
          const isBonds = inv.asset_type === "bonds";
          const isDeposit = inv.asset_type === "deposit";
          const typeLabel = isBonds
            ? "Погашення ОВДП"
            : isDeposit
              ? "Повернення депозиту"
              : "Завершення інвестиції";

          timelineItems.push({
            id: `investment-maturity-${inv.id}`,
            title: `📈 ${typeLabel}: ${inv.asset_name}`,
            date: matDate,
            source: "investment",
            type: "income",
            amount: Number(inv.current_value || inv.invested_amount),
            currency: inv.currency || "UAH",
            metadata: {
              assetType: inv.asset_type,
              yieldPercent: inv.yield_percent,
              notes: inv.notes,
            },
          });
        }
      }
    });

    // 4. Кастомні події (financial_events)
    const customEvents = (customEventsRes.data || []) as FinancialEvent[];
    customEvents.forEach((ev) => {
      let eventDate = ev.event_date;

      // Якщо повторювана подія — проектувати на вибраний місяць
      if (ev.is_recurring) {
        const originalDay = parseInt(ev.event_date.slice(8, 10), 10) || 1;
        const clampedDay = Math.min(originalDay, daysInMonth);
        const dayPadded = String(clampedDay).padStart(2, "0");
        const monthPadded = String(month + 1).padStart(2, "0");
        eventDate = `${year}-${monthPadded}-${dayPadded}`;
      }

      if (eventDate >= startIsoDate && eventDate <= endIsoDate) {
        timelineItems.push({
          id: `custom-${ev.id}`,
          title: ev.title,
          date: eventDate,
          source: "custom",
          type: ev.event_type,
          amount: ev.amount ? Number(ev.amount) : null,
          currency: ev.currency || "UAH",
          isCompleted: ev.is_completed,
          metadata: {
            dbId: ev.id,
            category: ev.category,
            isRecurring: ev.is_recurring,
            notifyDaysBefore: ev.notify_days_before,
            notes: ev.notes,
          },
        });
      }
    });

    // Сортування подій хронологічно
    timelineItems.sort((a, b) => a.date.localeCompare(b.date));

    return NextResponse.json({
      success: true,
      month: `${year}-${String(month + 1).padStart(2, "0")}`,
      activeCycle: activeCycle || null,
      events: timelineItems,
      customEvents: customEvents,
    });
  } catch (error: any) {
    console.error("[API calendar/events GET error]:", error);
    return NextResponse.json(
      { error: getSafeErrorMessage(error) },
      { status: 500 }
    );
  }
}

/**
 * Створення власної фінансової події
 */
export async function POST(req: Request) {
  try {
    if (!(await checkAuthSession())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = financialEventCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Некоректні дані події", details: parsed.error.issues },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin
      .from("financial_events")
      .insert({
        title: parsed.data.title,
        amount: parsed.data.amount ?? null,
        currency: parsed.data.currency,
        event_date: parsed.data.event_date,
        is_recurring: parsed.data.is_recurring,
        category: parsed.data.category ?? null,
        event_type: parsed.data.event_type,
        notify_days_before: parsed.data.notify_days_before,
        is_completed: parsed.data.is_completed,
        notes: parsed.data.notes ?? null,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, event: data }, { status: 201 });
  } catch (error: any) {
    console.error("[API calendar/events POST error]:", error);
    return NextResponse.json(
      { error: getSafeErrorMessage(error) },
      { status: 500 }
    );
  }
}

/**
 * Оновлення власної фінансової події (редагування або toggle completion)
 */
export async function PATCH(req: Request) {
  try {
    if (!(await checkAuthSession())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = financialEventUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Некоректні дані для оновлення",
          details: parsed.error.issues,
        },
        { status: 400 }
      );
    }

    const { id, ...updateFields } = parsed.data;
    const supabaseAdmin = getSupabaseAdmin();

    const { data, error } = await supabaseAdmin
      .from("financial_events")
      .update(updateFields)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, event: data });
  } catch (error: any) {
    console.error("[API calendar/events PATCH error]:", error);
    return NextResponse.json(
      { error: getSafeErrorMessage(error) },
      { status: 500 }
    );
  }
}

/**
 * Видалення власної фінансової події
 */
export async function DELETE(req: Request) {
  try {
    if (!(await checkAuthSession())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id || isNaN(Number(id))) {
      return NextResponse.json(
        { error: "Необхідно вказати валідний id події" },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { error } = await supabaseAdmin
      .from("financial_events")
      .delete()
      .eq("id", Number(id));

    if (error) throw error;

    return NextResponse.json({ success: true, deletedId: Number(id) });
  } catch (error: any) {
    console.error("[API calendar/events DELETE error]:", error);
    return NextResponse.json(
      { error: getSafeErrorMessage(error) },
      { status: 500 }
    );
  }
}
