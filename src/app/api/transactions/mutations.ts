import { SupabaseClient } from "@supabase/supabase-js";
import { cleanMerchantRaw } from "@/lib/normalize";
import { checkDailyBudgetThreshold } from "@/lib/budget-alerts";

export async function insertTransaction(
  supabase: SupabaseClient,
  transactionData: any
) {
  const { data, error } = await supabase
    .from("transactions")
    .insert([transactionData])
    .select()
    .single();

  if (error) {
    console.error("[API transactions POST] DB error:", error);
    throw error;
  }

  // Перевірка денного ліміту для сповіщення в Telegram
  if (transactionData.type === "expense") {
    await checkDailyBudgetThreshold().catch((alertErr) => {
      console.error("[API transactions POST] Budget alert error:", alertErr);
    });
  }

  return data;
}

export async function updateTransactionRecord(
  supabase: SupabaseClient,
  updatePayload: {
    id: number;
    category_name?: string;
    merchant_raw?: string;
    clean_title?: string;
    tags?: string[];
    save_as_rule?: boolean;
    exclude_from_budget?: boolean;
    metadata?: Record<string, any> | null;
  }
) {
  const {
    id,
    category_name,
    merchant_raw,
    clean_title,
    tags,
    save_as_rule,
    exclude_from_budget,
    metadata,
  } = updatePayload;

  const updateData: Record<string, any> = {};
  if (category_name) updateData.category_name = category_name;
  if (clean_title || merchant_raw)
    updateData.merchant_raw = clean_title || merchant_raw;
  if (tags !== undefined) updateData.tags = tags;
  if (exclude_from_budget !== undefined)
    updateData.exclude_from_budget = exclude_from_budget;

  if (metadata !== undefined) {
    if (metadata === null) {
      updateData.metadata = null;
    } else {
      const { data: currentTx } = await supabase
        .from("transactions")
        .select("metadata")
        .eq("id", id)
        .single();
      const existingMeta =
        currentTx?.metadata && typeof currentTx.metadata === "object"
          ? currentTx.metadata
          : {};
      const mergedMeta: Record<string, any> = {
        ...existingMeta,
        ...metadata,
      };
      Object.keys(mergedMeta).forEach((k) => {
        if (mergedMeta[k] === null) {
          delete mergedMeta[k];
        }
      });
      updateData.metadata = mergedMeta;
    }
  }

  const { data: updatedRows, error: txError } = await supabase
    .from("transactions")
    .update(updateData)
    .eq("id", id)
    .select();

  if (txError) throw txError;

  if (save_as_rule && category_name) {
    const { data: currentTx } = await supabase
      .from("transactions")
      .select("metadata, merchant_raw")
      .eq("id", id)
      .maybeSingle();

    const sourceMerchant =
      currentTx?.metadata?.raw_merchant ||
      merchant_raw ||
      currentTx?.merchant_raw;

    if (sourceMerchant) {
      const pattern = cleanMerchantRaw(sourceMerchant).trim().toLowerCase();
      if (pattern) {
        const { data: existingRule } = await supabase
          .from("merchant_rules")
          .select("id")
          .ilike("pattern", pattern)
          .maybeSingle();

        if (existingRule) {
          await supabase
            .from("merchant_rules")
            .update({
              pattern,
              clean_merchant: clean_title || pattern,
              category_name,
            })
            .eq("id", existingRule.id);
        } else {
          await supabase.from("merchant_rules").insert({
            pattern,
            clean_merchant: clean_title || pattern,
            category_name,
          });
        }
      }
    }
  }

  return updatedRows?.[0];
}

export async function deleteTransactionRecord(
  supabase: SupabaseClient,
  options: {
    id?: string | null;
    clearTrash?: boolean;
    permanent?: boolean;
  }
) {
  const { id, clearTrash, permanent } = options;

  // 1. Очищення всього кошика
  if (clearTrash) {
    const { error } = await supabase
      .from("transactions")
      .delete()
      .not("deleted_at", "is", null);

    if (
      error &&
      (error.code === "42703" || error.message?.includes("deleted_at"))
    ) {
      return { success: true, cleared: 0 };
    }
    if (error) throw error;
    return {
      success: true,
      message: "Кошик успішно очищено",
    };
  }

  // 2. Видалення конкретної транзакції
  const numId = Number(id);
  if (!id || isNaN(numId) || numId <= 0 || !Number.isInteger(numId)) {
    return {
      error: "Valid numeric Transaction ID required",
      status: 400,
    };
  }

  if (permanent) {
    // Безповоротне видалення
    const { error } = await supabase
      .from("transactions")
      .delete()
      .eq("id", numId);
    if (error) throw error;
    return { success: true, permanent: true };
  } else {
    // Soft Delete: переміщення в кошик на 10 днів
    const nowIso = new Date().toISOString();
    const { error: softErr } = await supabase
      .from("transactions")
      .update({ deleted_at: nowIso })
      .eq("id", numId);

    // Захисний fallback: якщо колонка deleted_at ще не додана в БД
    if (
      softErr &&
      (softErr.code === "42703" || softErr.message?.includes("deleted_at"))
    ) {
      console.warn(
        "[API transactions DELETE] deleted_at column missing, falling back to permanent delete"
      );
      const { error: permErr } = await supabase
        .from("transactions")
        .delete()
        .eq("id", numId);
      if (permErr) throw permErr;
      return { success: true, fallbackPermanent: true };
    }

    if (softErr) throw softErr;

    // Каскадне м'яке видалення для дочірніх сплітів (якщо видалено батьківську транзакцію)
    await supabase
      .from("transactions")
      .update({ deleted_at: nowIso })
      .eq("parent_transaction_id", numId);

    return { success: true, softDeleted: true };
  }
}
