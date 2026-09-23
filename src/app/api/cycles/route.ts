import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { verifySessionToken } from "@/lib/session";
import { generateCycleSummary } from "@/lib/telegram-digest";

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

// Отримати активний цикл та історію останніх
export async function GET() {
  try {
    if (!(await checkAuthSession())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getSupabaseAdmin();

    const { data: cycles, error } = await supabase
      .from("budget_cycles")
      .select(
        "id, name, budget_limit, start_date, end_date, is_active, created_at"
      )
      .order("start_date", { ascending: false });

    if (error) {
      console.error("[API cycles GET] Error fetching cycles:", error);
      throw error;
    }

    const activeCycle = cycles?.find((c) => c.is_active) || null;

    return NextResponse.json(
      { activeCycle, cycles: cycles || [] },
      {
        headers: {
          "Cache-Control":
            "private, no-cache, no-store, max-age=0, must-revalidate",
        },
      }
    );
  } catch (err: any) {
    console.error("[API cycles GET error]:", err);
    return NextResponse.json(
      { error: getSafeErrorMessage(err) },
      { status: 500 }
    );
  }
}

// Почати новий цикл
export async function POST(req: Request) {
  try {
    if (!(await checkAuthSession())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getSupabaseAdmin();
    const body = await req.json();
    const { name, budget_limit, start_date } = body;

    const parsedLimit = Number(budget_limit);
    if (isNaN(parsedLimit) || parsedLimit <= 0 || parsedLimit > 100_000_000) {
      return NextResponse.json(
        {
          error:
            "Сума ліміту повинна бути більше 0 і не перевищувати 100,000,000",
        },
        { status: 400 }
      );
    }

    let cycleStart = new Date().toISOString();
    if (start_date) {
      const parsedDate = new Date(start_date);
      if (isNaN(parsedDate.getTime())) {
        return NextResponse.json(
          { error: "Некоректний формат дати" },
          { status: 400 }
        );
      }
      cycleStart = parsedDate.toISOString();
    }

    const cleanName =
      (typeof name === "string" ? name.trim().slice(0, 100) : "") ||
      "Новий цикл";

    // 1. Знаходимо попередній активний цикл для підсумкового дайджесту
    const { data: previousCycle } = await supabase
      .from("budget_cycles")
      .select("id")
      .eq("is_active", true)
      .maybeSingle();

    // 2. Закриваємо попередній активний цикл із обов'язковою перевіркою результату
    const { error: closeError } = await supabase
      .from("budget_cycles")
      .update({
        is_active: false,
        end_date: cycleStart,
      })
      .eq("is_active", true);

    if (closeError) {
      console.error(
        "[API cycles POST] Error closing previous cycle:",
        closeError
      );
      throw closeError;
    }

    // 3. Створюємо новий активний цикл
    const { data: newCycle, error: insertError } = await supabase
      .from("budget_cycles")
      .insert([
        {
          name: cleanName,
          budget_limit: parsedLimit,
          start_date: cycleStart,
          is_active: true,
        },
      ])
      .select()
      .single();

    if (insertError) {
      console.error(
        "[API cycles POST] Error inserting new cycle:",
        insertError
      );
      throw insertError;
    }

    // 4. Надсилаємо підсумковий AI-звіт закритого циклу у Telegram
    if (previousCycle?.id) {
      generateCycleSummary(previousCycle.id, { force: true }).catch(
        (summaryErr) => {
          console.warn(
            "[API cycles POST] Error generating end-of-cycle summary:",
            summaryErr
          );
        }
      );
    }

    return NextResponse.json({ success: true, cycle: newCycle });
  } catch (err: any) {
    console.error("[API cycles POST error]:", err);
    return NextResponse.json(
      { error: getSafeErrorMessage(err) },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request) {
  try {
    if (!(await checkAuthSession())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getSupabaseAdmin();
    const body = await req.json();
    const { cycleId, limit } = body;
    const numericLimit = Number(limit);

    if (
      !cycleId ||
      typeof cycleId !== "string" ||
      isNaN(numericLimit) ||
      numericLimit <= 0 ||
      numericLimit > 100_000_000
    ) {
      return NextResponse.json(
        { error: "Некоректний ID циклу або сума ліміту" },
        { status: 400 }
      );
    }

    const { error: updateError } = await supabase
      .from("budget_cycles")
      .update({ budget_limit: numericLimit })
      .eq("id", cycleId);

    if (updateError) {
      console.error(
        "[API cycles PATCH] Error updating budget limit:",
        updateError
      );
      throw updateError;
    }

    return NextResponse.json({ success: true, limit: numericLimit });
  } catch (err: any) {
    console.error("[API cycles PATCH error]:", err);
    return NextResponse.json(
      { error: getSafeErrorMessage(err) },
      { status: 500 }
    );
  }
}
