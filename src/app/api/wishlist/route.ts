import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { verifySessionToken } from "@/lib/session";
import {
  wishlistItemSchema,
  wishlistItemUpdateSchema,
  wishlistResolveSchema,
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
      .from("wishlist_items")
      .select(
        "id, title, estimated_price, currency, category_name, url, notes, cooling_days, cooling_end_date, status, resolved_at, created_at, initial_price, target_price, price_history, savings_goal_id"
      )
      .order("created_at", { ascending: false });

    if (error) throw error;

    // Підтягуємо зв'язані скарбнички, якщо є
    const goalIds = (data || [])
      .map((i: any) => i.savings_goal_id)
      .filter((id: any): id is number => typeof id === "number" && id > 0);

    let goalsMap: Record<number, any> = {};
    if (goalIds.length > 0) {
      try {
        const { data: goalsData } = await supabaseAdmin
          .from("savings_goals")
          .select("id, name, target_amount, current_amount, currency")
          .in("id", goalIds);
        if (goalsData) {
          goalsMap = Object.fromEntries(goalsData.map((g: any) => [g.id, g]));
        }
      } catch (gErr) {
        console.warn("[API wishlist] Could not fetch linked goals:", gErr);
      }
    }

    const now = new Date();
    const items = (data || []).map((item: any) => {
      // Якщо статус "cooling", але дата охолодження вже минула - статус стає "ready"
      let currentStatus = item.status;
      if (item.status === "cooling" && new Date(item.cooling_end_date) <= now) {
        currentStatus = "ready";
      }
      return {
        ...item,
        status: currentStatus,
        initial_price: item.initial_price ?? item.estimated_price,
        savings_goal: item.savings_goal_id
          ? goalsMap[item.savings_goal_id] || null
          : null,
      };
    });

    const savedAmount = items
      .filter((i) => i.status === "saved")
      .reduce((sum, i) => sum + Number(i.estimated_price || 0), 0);

    const coolingCount = items.filter((i) => i.status === "cooling").length;
    const readyCount = items.filter((i) => i.status === "ready").length;
    const pendingAmount = items
      .filter((i) => i.status === "cooling" || i.status === "ready")
      .reduce((sum, i) => sum + Number(i.estimated_price || 0), 0);

    return NextResponse.json(
      {
        items,
        metrics: {
          saved_amount: savedAmount,
          cooling_count: coolingCount,
          ready_count: readyCount,
          pending_amount: pendingAmount,
        },
      },
      {
        headers: {
          "Cache-Control":
            "private, no-cache, no-store, max-age=0, must-revalidate",
        },
      }
    );
  } catch (error: any) {
    console.error("[API wishlist GET error]:", error);
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

    // Перевірка на дію резолву / оновлення ціни / лінкування
    const resolveParsed = wishlistResolveSchema.safeParse(rawBody);
    if (resolveParsed.success) {
      const {
        id,
        action,
        extend_days,
        new_price,
        price_source,
        price_notes,
        savings_goal_id,
      } = resolveParsed.data;
      const supabaseAdmin = getSupabaseAdmin();

      let updateData: Record<string, any> = {};
      const nowIso = new Date().toISOString();

      if (action === "saved") {
        updateData = { status: "saved", resolved_at: nowIso };
      } else if (action === "purchased") {
        updateData = { status: "purchased", resolved_at: nowIso };
      } else if (action === "extend") {
        const days = extend_days || 7;
        const newEndDate = new Date(Date.now() + days * 86400000).toISOString();
        updateData = {
          status: "cooling",
          cooling_end_date: newEndDate,
          resolved_at: null,
        };
      } else if (action === "update_price") {
        const { data: existing } = await supabaseAdmin
          .from("wishlist_items")
          .select("price_history, estimated_price, initial_price")
          .eq("id", id)
          .single();

        const history = Array.isArray(existing?.price_history)
          ? [...existing.price_history]
          : existing?.initial_price
            ? [
                {
                  date: nowIso,
                  price: Number(existing.initial_price),
                  source: "manual",
                },
              ]
            : [];

        if (typeof new_price === "number" && new_price > 0) {
          history.push({
            date: nowIso,
            price: new_price,
            source: price_source || "manual",
            notes: price_notes || undefined,
          });
          updateData = {
            estimated_price: new_price,
            price_history: history,
          };
        }
      } else if (action === "link_savings_goal") {
        updateData = {
          savings_goal_id: savings_goal_id ?? null,
        };
      }

      const { data, error } = await supabaseAdmin
        .from("wishlist_items")
        .update(updateData)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return NextResponse.json({ success: true, item: data });
    }

    // Звичайне створення бажання
    const parsed = wishlistItemSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const days = parsed.data.cooling_days || 14;
    const coolingEndDate =
      parsed.data.cooling_end_date ||
      new Date(Date.now() + days * 86400000).toISOString();

    const initialPrice =
      parsed.data.initial_price ?? parsed.data.estimated_price;
    const history =
      parsed.data.price_history && parsed.data.price_history.length > 0
        ? parsed.data.price_history
        : [
            {
              date: new Date().toISOString(),
              price: parsed.data.estimated_price,
              source: "manual" as const,
            },
          ];

    const insertPayload = {
      ...parsed.data,
      initial_price: initialPrice,
      price_history: history,
      cooling_end_date: coolingEndDate,
      status: "cooling",
    };

    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin
      .from("wishlist_items")
      .insert([insertPayload])
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, item: data });
  } catch (error: any) {
    console.error("[API wishlist POST error]:", error);
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
    const parsed = wishlistItemUpdateSchema.safeParse(rawBody);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { id, ...updateData } = parsed.data;
    const supabaseAdmin = getSupabaseAdmin();

    const { data, error } = await supabaseAdmin
      .from("wishlist_items")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, item: data });
  } catch (error: any) {
    console.error("[API wishlist PATCH error]:", error);
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
      .from("wishlist_items")
      .delete()
      .eq("id", numId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[API wishlist DELETE error]:", error);
    return NextResponse.json(
      { error: getSafeErrorMessage(error) },
      { status: 500 }
    );
  }
}
