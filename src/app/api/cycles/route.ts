import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// Отримати активний цикл та історію останніх
export async function GET() {
  try {
    const { data: cycles, error } = await supabase
      .from("budget_cycles")
      .select("*")
      .order("start_date", { ascending: false });

    if (error) throw error;

    const activeCycle = cycles?.find((c) => c.is_active) || null;

    return NextResponse.json({ activeCycle, cycles: cycles || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// Почати новий цикл
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, budget_limit, start_date } = body;

    const cycleStart = start_date
      ? new Date(start_date).toISOString()
      : new Date().toISOString();

    // 1. Закриваємо попередній активний цикл
    await supabase
      .from("budget_cycles")
      .update({
        is_active: false,
        end_date: cycleStart,
      })
      .eq("is_active", true);

    // 2. Створюємо новий активний цикл
    const { data: newCycle, error } = await supabase
      .from("budget_cycles")
      .insert([
        {
          name: name || "Новий цикл",
          budget_limit: Number(budget_limit) || 35000,
          start_date: cycleStart,
          is_active: true,
        },
      ])
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, cycle: newCycle });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
