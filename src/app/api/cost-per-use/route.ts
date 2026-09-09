import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { verifySessionToken } from "@/lib/session";
import {
  costPerUseSchema,
  costPerUseUpdateSchema,
  costPerUseActionSchema,
} from "@/lib/validations";

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

export async function GET() {
  try {
    if (!(await checkAuthSession())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin
      .from("cost_per_use_items")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;

    let totalInvested = 0;
    let totalMoneySaved = 0;

    const items = (data || []).map((item) => {
      const price = Number(item.purchase_price || 0);
      const uses = Math.max(1, Number(item.total_uses || 1));
      const currentCost = Math.round((price / uses) * 100) / 100;
      totalInvested += price;

      let moneySaved = 0;
      let roiPercent = 0;

      if (item.benchmark_cost_per_use && Number(item.benchmark_cost_per_use) > 0) {
        const benchmark = Number(item.benchmark_cost_per_use);
        const totalBenchmarkValue = benchmark * uses;
        moneySaved = Math.max(0, totalBenchmarkValue - price);
        roiPercent = Math.round((totalBenchmarkValue / price) * 100);
        totalMoneySaved += moneySaved;
      }

      return {
        ...item,
        current_cost_per_use: currentCost,
        money_saved: moneySaved,
        roi_percent: roiPercent,
      };
    });

    return NextResponse.json({
      items,
      metrics: {
        total_tracked_assets: items.length,
        total_invested: totalInvested,
        total_money_saved: Math.round(totalMoneySaved),
      },
    });
  } catch (error: any) {
    console.error("[API cost-per-use GET error]:", error);
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

    // 1. Перевірка на дію "log_use" (+1 використання в один клік)
    const actionParsed = costPerUseActionSchema.safeParse(rawBody);
    if (actionParsed.success) {
      const { id, increment } = actionParsed.data;
      const supabaseAdmin = getSupabaseAdmin();

      const { data: current, error: fetchErr } = await supabaseAdmin
        .from("cost_per_use_items")
        .select("total_uses")
        .eq("id", id)
        .single();

      if (fetchErr || !current) {
        return NextResponse.json(
          { error: "Запис не знайдено" },
          { status: 404 }
        );
      }

      const newUses = Number(current.total_uses || 0) + (increment || 1);
      const nowIso = new Date().toISOString();

      const { data, error } = await supabaseAdmin
        .from("cost_per_use_items")
        .update({
          total_uses: newUses,
          last_used_at: nowIso,
        })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return NextResponse.json({ success: true, item: data });
    }

    // 2. Створення нової одиниці
    const parsed = costPerUseSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin
      .from("cost_per_use_items")
      .insert([parsed.data])
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, item: data });
  } catch (error: any) {
    console.error("[API cost-per-use POST error]:", error);
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
    const parsed = costPerUseUpdateSchema.safeParse(rawBody);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { id, ...updateData } = parsed.data;
    const supabaseAdmin = getSupabaseAdmin();

    const { data, error } = await supabaseAdmin
      .from("cost_per_use_items")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, item: data });
  } catch (error: any) {
    console.error("[API cost-per-use PATCH error]:", error);
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
      .from("cost_per_use_items")
      .delete()
      .eq("id", numId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[API cost-per-use DELETE error]:", error);
    return NextResponse.json(
      { error: getSafeErrorMessage(error) },
      { status: 500 }
    );
  }
}
