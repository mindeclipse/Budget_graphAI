import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { cleanMerchantRaw } from "@/lib/normalize";
import { verifySessionToken } from "@/lib/session";
import {
  transactionCreateSchema,
  transactionUpdateSchema,
} from "@/lib/validations";
import { checkDailyBudgetThreshold } from "@/lib/budget-alerts";

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

// GET: вибірка транзакцій з підтримкою фільтрації за датами та пагінацією
export async function GET(req: NextRequest) {
  try {
    if (!(await checkAuthSession())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const fromDate = searchParams.get("from");
    const toDate = searchParams.get("to");
    const limitParam = searchParams.get("limit");
    const offsetParam = searchParams.get("offset");

    // Фільтрація за типом транзакції через allowlist (захист від ін'єкцій)
    const rawTypeParam = searchParams.get("type");
    const ALLOWED_TYPES = [
      "investment",
      "expense",
      "income",
      "transfer",
    ] as const;
    type AllowedType = (typeof ALLOWED_TYPES)[number];
    const typeFilter: AllowedType | null =
      rawTypeParam && ALLOWED_TYPES.includes(rawTypeParam as AllowedType)
        ? (rawTypeParam as AllowedType)
        : null;

    if (fromDate && isNaN(new Date(fromDate).getTime())) {
      return NextResponse.json(
        { error: "Invalid 'from' date format" },
        { status: 400 }
      );
    }
    if (toDate && isNaN(new Date(toDate).getTime())) {
      return NextResponse.json(
        { error: "Invalid 'to' date format" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    const offset = offsetParam ? Math.max(Number(offsetParam) || 0, 0) : 0;

    // Для запитів типу investment збільшуємо ліміт до 5000, щоб охопити всю
    // історію незалежно від кількості щоденних витрат
    const defaultLimit = typeFilter === "investment" ? 5000 : 1500;
    const requestedLimit = limitParam
      ? Math.min(Math.max(Number(limitParam) || 0, 1), 5000)
      : defaultLimit;

    const isTrash = searchParams.get("trash") === "true";

    // Оптимізація та безпека: вибірка лише необхідних полів (Strict Column Projection)
    let query = supabase
      .from("transactions")
      .select(
        "id, created_at, amount, currency, merchant_raw, category_name, source, type, exclude_from_budget, tags, parent_transaction_id, original_amount, original_currency, deleted_at, metadata"
      )
      .order("created_at", { ascending: false });

    // Фільтрація за кошиком: або лише видалені, або лише активні
    if (isTrash) {
      query = query.not("deleted_at", "is", null);
    } else {
      query = query.is("deleted_at", null);
    }

    // Фільтрація за типом транзакції (allowlist-валідовано вище)
    if (typeFilter) {
      query = query.eq("type", typeFilter);
    }

    // Фільтрація за періодом (використовує idx_transactions_created_at_desc або idx_transactions_budget_filter)
    if (fromDate) {
      query = query.gte("created_at", fromDate);
    }
    if (toDate) {
      query = query.lte("created_at", toDate);
    }

    const CHUNK_SIZE = 1000;
    let data: any[] = [];
    let error: any = null;

    if (requestedLimit <= CHUNK_SIZE) {
      const res = await query.range(offset, offset + requestedLimit - 1);
      data = res.data || [];
      error = res.error;
    } else {
      let currentOffset = offset;
      let remaining = requestedLimit;
      while (remaining > 0) {
        const fetchCount = Math.min(remaining, CHUNK_SIZE);
        const res = await query.range(
          currentOffset,
          currentOffset + fetchCount - 1
        );
        if (res.error) {
          error = res.error;
          break;
        }
        const chunk = res.data || [];
        data.push(...chunk);
        if (chunk.length < fetchCount) {
          break;
        }
        currentOffset += chunk.length;
        remaining -= chunk.length;
      }
    }

    // Захисний механізм: якщо колонка deleted_at ще не створена в Supabase через міграцію
    if (
      error &&
      (error.code === "42703" ||
        error.message?.includes("deleted_at") ||
        error.message?.includes("column"))
    ) {
      console.warn(
        "[API transactions GET] Column deleted_at missing in DB, fallback without filter."
      );
      if (isTrash) {
        return NextResponse.json({
          transactions: [],
          count: 0,
          hasMore: false,
        });
      }

      let fallbackQuery = supabase
        .from("transactions")
        .select(
          "id, created_at, amount, currency, merchant_raw, category_name, source, type, exclude_from_budget, tags, parent_transaction_id, original_amount, original_currency, metadata"
        )
        .order("created_at", { ascending: false });

      if (fromDate) fallbackQuery = fallbackQuery.gte("created_at", fromDate);
      if (toDate) fallbackQuery = fallbackQuery.lte("created_at", toDate);

      if (requestedLimit <= CHUNK_SIZE) {
        const fallbackRes = await fallbackQuery.range(
          offset,
          offset + requestedLimit - 1
        );
        data = (fallbackRes.data || []).map((t) => ({
          ...t,
          deleted_at: null,
        }));
        error = fallbackRes.error;
      } else {
        let fallbackData: any[] = [];
        let fallbackOffset = offset;
        let fallbackRemaining = requestedLimit;
        let fallbackError: any = null;

        while (fallbackRemaining > 0) {
          const fetchCount = Math.min(fallbackRemaining, CHUNK_SIZE);
          const fallbackRes = await fallbackQuery.range(
            fallbackOffset,
            fallbackOffset + fetchCount - 1
          );
          if (fallbackRes.error) {
            fallbackError = fallbackRes.error;
            break;
          }
          const chunk = (fallbackRes.data || []).map((t) => ({
            ...t,
            deleted_at: null,
          }));
          fallbackData.push(...chunk);
          if (chunk.length < fetchCount) {
            break;
          }
          fallbackOffset += chunk.length;
          fallbackRemaining -= chunk.length;
        }
        data = fallbackData;
        error = fallbackError;
      }
    }

    if (error) {
      console.error("[API transactions GET] DB error:", error);
      throw error;
    }

    const transactions = data || [];

    return NextResponse.json({
      transactions,
      count: transactions.length,
      hasMore: transactions.length === requestedLimit,
    });
  } catch (err: any) {
    console.error("Transaction GET error:", err);
    return NextResponse.json(
      { error: getSafeErrorMessage(err) },
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
      throw error;
    }

    // Перевірка денного ліміту для сповіщення в Telegram
    if (parsed.data.type === "expense") {
      await checkDailyBudgetThreshold().catch((alertErr) => {
        console.error("[API transactions POST] Budget alert error:", alertErr);
      });
    }

    return NextResponse.json({ success: true, transaction: data });
  } catch (err: any) {
    console.error("Transaction POST error:", err);
    return NextResponse.json(
      { error: getSafeErrorMessage(err) },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    if (!(await checkAuthSession())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rawBody = await req.json();
    const parsed = transactionUpdateSchema.safeParse(rawBody);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const {
      id,
      category_name,
      merchant_raw,
      clean_title,
      tags,
      save_as_rule,
      metadata,
    } = parsed.data;
    const supabase = getSupabaseAdmin();

    const updateData: Record<string, any> = {};
    if (category_name) updateData.category_name = category_name;
    if (clean_title || merchant_raw)
      updateData.merchant_raw = clean_title || merchant_raw;
    if (tags !== undefined) updateData.tags = tags;

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
        updateData.metadata = { ...existingMeta, ...metadata };
      }
    }

    const { data: updatedRows, error: txError } = await supabase
      .from("transactions")
      .update(updateData)
      .eq("id", id)
      .select();

    if (txError) throw txError;

    if (save_as_rule && category_name) {
      // Пріоритет: вихідна назва мерчанта з metadata.raw_merchant (якщо транзакція з банку/Apple Pay),
      // інакше поточний merchant_raw транзакції
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

    return NextResponse.json({ success: true, updated: updatedRows?.[0] });
  } catch (err: any) {
    console.error("Transaction PATCH error:", err);
    return NextResponse.json(
      { error: getSafeErrorMessage(err) },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    if (!(await checkAuthSession())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getSupabaseAdmin();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const clearTrash = searchParams.get("clear_trash") === "true";
    const permanent = searchParams.get("permanent") === "true";

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
        return NextResponse.json({ success: true, cleared: 0 });
      }
      if (error) throw error;
      return NextResponse.json({
        success: true,
        message: "Кошик успішно очищено",
      });
    }

    // 2. Видалення конкретної транзакції
    const numId = Number(id);
    if (!id || isNaN(numId) || numId <= 0 || !Number.isInteger(numId)) {
      return NextResponse.json(
        { error: "Valid numeric Transaction ID required" },
        { status: 400 }
      );
    }

    if (permanent) {
      // Безповоротне видалення
      const { error } = await supabase
        .from("transactions")
        .delete()
        .eq("id", numId);
      if (error) throw error;
      return NextResponse.json({ success: true, permanent: true });
    } else {
      // Soft Delete: переміщення в кошик на 10 днів
      const { error: softErr } = await supabase
        .from("transactions")
        .update({ deleted_at: new Date().toISOString() })
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
        return NextResponse.json({ success: true, fallbackPermanent: true });
      }

      if (softErr) throw softErr;
      return NextResponse.json({ success: true, softDeleted: true });
    }
  } catch (err: any) {
    console.error("Transaction DELETE error:", err);
    return NextResponse.json(
      { error: getSafeErrorMessage(err) },
      { status: 500 }
    );
  }
}
