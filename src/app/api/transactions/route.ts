import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { cleanMerchantRaw } from "@/lib/normalize";

// GET: вибірка транзакцій з пагінацією через сервісний клієнт
export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const PAGE_SIZE = 1000;
    let allTransactions: any[] = [];
    let page = 0;
    const MAX_PAGES = 10; // Ліміт до 10 000 записів

    while (page < MAX_PAGES) {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .order("created_at", { ascending: false })
        .range(from, to);

      if (error) {
        console.error("[API transactions GET] DB error:", error);
        throw error;
      }

      if (!data || data.length === 0) break;

      allTransactions.push(...data);

      if (data.length < PAGE_SIZE) break;
      page++;
    }

    return NextResponse.json({ transactions: allTransactions });
  } catch (err: any) {
    console.error("Transaction GET error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from("transactions")
      .insert(Array.isArray(body) ? body : [body])
      .select()
      .single();

    if (error) {
      console.error("[API transactions POST] DB error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, transaction: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    const body = await req.json();
    const { id, category_name, merchant_raw, clean_title, save_as_rule } = body;

    if (!id) {
      return NextResponse.json(
        { error: "Transaction ID required" },
        { status: 400 }
      );
    }

    // 1. Формуємо дані для оновлення
    const updateData: Record<string, any> = {};
    if (category_name) updateData.category_name = category_name;
    if (clean_title) updateData.merchant_raw = clean_title;
    if (body.tags !== undefined) updateData.tags = body.tags;

    const { data: updatedRows, error: txError } = await supabase
      .from("transactions")
      .update(updateData)
      .eq("id", id)
      .select();

    if (txError) {
      console.error("[API transactions PATCH] DB error:", txError);
      throw txError;
    }

    if (!updatedRows || updatedRows.length === 0) {
      console.warn(
        `[API transactions PATCH] Транзакцію з id ${id} не знайдено`
      );
    }

    // 2. Збереження правила авто-категоризації
    if (save_as_rule && merchant_raw && category_name) {
      const pattern = cleanMerchantRaw(merchant_raw);

      const { error: ruleError } = await supabase.from("merchant_rules").upsert(
        {
          pattern,
          normalized_name: clean_title || pattern,
          category_name,
        },
        { onConflict: "pattern" }
      );

      if (ruleError) {
        console.error(
          "[API transactions PATCH] Rules upsert error:",
          ruleError
        );
      }
    }

    return NextResponse.json({ success: true, updated: updatedRows?.[0] });
  } catch (err: any) {
    console.error("Transaction PATCH error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "Transaction ID required" },
        { status: 400 }
      );
    }

    const { error } = await supabase.from("transactions").delete().eq("id", id);

    if (error) {
      console.error("[API transactions DELETE] Error:", error);
      throw error;
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Transaction DELETE error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
