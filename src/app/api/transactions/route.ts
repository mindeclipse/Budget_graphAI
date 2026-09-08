import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { cleanMerchantRaw } from "@/lib/normalize";

export async function PATCH(req: NextRequest) {
  try {
    // Використовуємо Admin-клієнт із правами на запис у БД
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

    // .select() повертає оновлений рядок для перевірки фактичного запису
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

    // 2. Якщо обрано збереження правила для наступних покупок
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
