import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

// Отримати активний цикл та історію останніх
export async function GET() {
  try {
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
    const supabase = getSupabaseAdmin();
    const body = await req.json();
    const { name, budget_limit, start_date } = body;

    const cycleStart = start_date
      ? new Date(start_date).toISOString()
      : new Date().toISOString();

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
          name: name?.trim() || "Новий цикл",
          budget_limit: Number(budget_limit) || 35000,
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
    const supabase = getSupabaseAdmin();
    const body = await req.json();
    const { cycleId, limit } = body;
    const numericLimit = Number(limit);

    if (!cycleId || isNaN(numericLimit) || numericLimit <= 0) {
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
