import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { verifySessionToken } from "@/lib/session";
import { savingsGoalSchema, savingsGoalUpdateSchema } from "@/lib/validations";
import { z } from "zod";

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

const depositActionSchema = z.object({
  action: z.literal("deposit"),
  goal_id: z.number().int().positive(),
  amount: z.number().positive("Сума поповнення має бути більшою за нуль"),
});

export async function GET() {
  try {
    if (!(await checkAuthSession())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin
      .from("savings_goals")
      .select("*")
      .order("id", { ascending: true });

    if (error) throw error;
    return NextResponse.json({ goals: data || [] });
  } catch (error: any) {
    console.error("[API savings-goals GET error]:", error);
    return NextResponse.json(
      { error: getSafeErrorMessage(error) },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    if (!(await checkAuthSession())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rawBody = await req.json();

    // Перевірка на дію "deposit" (поповнення скарбнички)
    const depositParsed = depositActionSchema.safeParse(rawBody);
    if (depositParsed.success) {
      const { goal_id, amount } = depositParsed.data;
      const supabaseAdmin = getSupabaseAdmin();

      // Отримуємо поточну суму
      const { data: currentGoal, error: fetchErr } = await supabaseAdmin
        .from("savings_goals")
        .select("current_amount")
        .eq("id", goal_id)
        .single();

      if (fetchErr || !currentGoal) {
        return NextResponse.json(
          { error: "Скарбничку не знайдено" },
          { status: 404 }
        );
      }

      const newAmount = Number(currentGoal.current_amount || 0) + amount;
      const { data: updatedGoal, error: updateErr } = await supabaseAdmin
        .from("savings_goals")
        .update({ current_amount: newAmount })
        .eq("id", goal_id)
        .select()
        .single();

      if (updateErr) throw updateErr;

      return NextResponse.json({ success: true, goal: updatedGoal });
    }

    // Звичайне створення нової цілі
    const parsed = savingsGoalSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin
      .from("savings_goals")
      .insert([parsed.data])
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, goal: data });
  } catch (error: any) {
    console.error("[API savings-goals POST error]:", error);
    return NextResponse.json(
      { error: getSafeErrorMessage(error) },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request) {
  try {
    if (!(await checkAuthSession())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rawBody = await req.json();
    const parsed = savingsGoalUpdateSchema.safeParse(rawBody);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { id, ...updateData } = parsed.data;
    const supabaseAdmin = getSupabaseAdmin();

    const { data, error } = await supabaseAdmin
      .from("savings_goals")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, goal: data });
  } catch (error: any) {
    console.error("[API savings-goals PATCH error]:", error);
    return NextResponse.json(
      { error: getSafeErrorMessage(error) },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    if (!(await checkAuthSession())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const numId = Number(id);

    if (!id || isNaN(numId) || numId <= 0 || !Number.isInteger(numId)) {
      return NextResponse.json(
        { error: "Valid numeric ID is required" },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { error } = await supabaseAdmin
      .from("savings_goals")
      .delete()
      .eq("id", numId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[API savings-goals DELETE error]:", error);
    return NextResponse.json(
      { error: getSafeErrorMessage(error) },
      { status: 500 }
    );
  }
}
