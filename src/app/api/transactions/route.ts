import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { cleanMerchantRaw } from "@/lib/normalize";
import {
  transactionCreateSchema,
  transactionUpdateSchema,
} from "@/lib/validations";

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const PAGE_SIZE = 1000;
    let allTransactions: any[] = [];
    let page = 0;
    const MAX_PAGES = 10;

    while (page < MAX_PAGES) {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .order("created_at", { ascending: false })
        .range(from, to);

      if (error) throw error;
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
    const rawBody = await req.json();
    const parsed = transactionCreateSchema.safeParse(rawBody);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("transactions")
      .insert([parsed.data])
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
    const rawBody = await req.json();
    const parsed = transactionUpdateSchema.safeParse(rawBody);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { id, category_name, merchant_raw, clean_title, tags, save_as_rule } =
      parsed.data;
    const supabase = getSupabaseAdmin();

    const updateData: Record<string, any> = {};
    if (category_name) updateData.category_name = category_name;
    if (clean_title || merchant_raw)
      updateData.merchant_raw = clean_title || merchant_raw;
    if (tags !== undefined) updateData.tags = tags;

    const { data: updatedRows, error: txError } = await supabase
      .from("transactions")
      .update(updateData)
      .eq("id", id)
      .select();

    if (txError) throw txError;

    if (save_as_rule && merchant_raw && category_name) {
      const pattern = cleanMerchantRaw(merchant_raw);
      await supabase.from("merchant_rules").upsert(
        {
          pattern,
          normalized_name: clean_title || pattern,
          category_name,
        },
        { onConflict: "pattern" }
      );
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
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Transaction DELETE error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
