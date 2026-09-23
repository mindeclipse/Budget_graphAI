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
        "id, title, estimated_price, currency, category_name, url, notes, cooling_days, cooling_end_date, status, resolved_at, created_at"
      )
      .order("created_at", { ascending: false });

    if (error) throw error;

    const now = new Date();
    const items = (data || []).map((item) => {
      // Якщо статус "cooling", але дата охолодження вже минула - статус стає "ready"
      if (item.status === "cooling" && new Date(item.cooling_end_date) <= now) {
        return { ...item, status: "ready" };
      }
      return item;
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

    // Перевірка на дію резолву (saved / purchased / extend)
    const resolveParsed = wishlistResolveSchema.safeParse(rawBody);
    if (resolveParsed.success) {
      const { id, action, extend_days } = resolveParsed.data;
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

    const insertPayload = {
      ...parsed.data,
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
