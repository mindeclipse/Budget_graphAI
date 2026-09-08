// src/app/api/transactions/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { cleanMerchantRaw } from "@/lib/normalize";

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, category_name, merchant_raw, clean_title, save_as_rule } = body;

    if (!id) {
      return NextResponse.json(
        { error: "Transaction ID required" },
        { status: 400 }
      );
    }

    // 1. Оновлюємо саму транзакцію
    const updateData: any = {};
    if (category_name) updateData.category_name = category_name;
    if (clean_title) updateData.merchant_raw = clean_title;
    if (body.tags) updateData.tags = body.tags;

    const { error: txError } = await supabase
      .from("transactions")
      .update(updateData)
      .eq("id", id);

    if (txError) throw txError;

    // 2. Якщо користувач зазначив "Запам'ятати правило для цього мерчанта"
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

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Transaction PATCH error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
