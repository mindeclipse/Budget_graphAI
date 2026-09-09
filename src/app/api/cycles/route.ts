import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { verifySessionToken } from "@/lib/session";

async function checkAuthSession(): Promise<boolean> {
  const cookieStore = await cookies();
  const session = cookieStore.get("finance_session")?.value;
  const { valid } = await verifySessionToken(session);
  return valid;
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
      .select("*")
      .order("start_date", { ascending: false });

    if (error) {
      console.error("[API cycles GET] Error fetching cycles:", error);
      throw error;
    }

    const activeCycle = cycles?.find((c) => c.is_active) || null;

    return NextResponse.json({ activeCycle, cycles: cycles || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
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

    // 1. Закриваємо попередній активний цикл із обов'язковою перевіркою результату
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

    // 2. Створюємо новий активний цикл
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

    return NextResponse.json({ success: true, cycle: newCycle });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
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
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
