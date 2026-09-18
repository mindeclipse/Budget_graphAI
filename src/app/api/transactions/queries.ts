import { SupabaseClient } from "@supabase/supabase-js";

export const ALLOWED_TRANSACTION_TYPES = [
  "investment",
  "expense",
  "income",
  "transfer",
] as const;

export type AllowedTransactionType = (typeof ALLOWED_TRANSACTION_TYPES)[number];

export interface FetchTransactionsParams {
  fromDate?: string | null;
  toDate?: string | null;
  limitParam?: string | null;
  offsetParam?: string | null;
  rawTypeParam?: string | null;
  isTrash?: boolean;
}

export interface FetchTransactionsResult {
  transactions: any[];
  count: number;
  hasMore: boolean;
}

export async function fetchTransactionsList(
  supabase: SupabaseClient,
  params: FetchTransactionsParams
): Promise<FetchTransactionsResult> {
  const { fromDate, toDate, limitParam, offsetParam, rawTypeParam, isTrash } =
    params;

  const typeFilter: AllowedTransactionType | null =
    rawTypeParam &&
    ALLOWED_TRANSACTION_TYPES.includes(rawTypeParam as AllowedTransactionType)
      ? (rawTypeParam as AllowedTransactionType)
      : null;

  const offset = offsetParam ? Math.max(Number(offsetParam) || 0, 0) : 0;
  const defaultLimit = typeFilter === "investment" ? 5000 : 1500;
  const requestedLimit = limitParam
    ? Math.min(Math.max(Number(limitParam) || 0, 1), 5000)
    : defaultLimit;

  let query = supabase
    .from("transactions")
    .select(
      "id, created_at, amount, currency, merchant_raw, category_name, source, type, exclude_from_budget, tags, parent_transaction_id, original_amount, original_currency, deleted_at, metadata"
    )
    .order("created_at", { ascending: false });

  if (isTrash) {
    query = query.not("deleted_at", "is", null);
  } else {
    query = query.is("deleted_at", null);
  }

  if (typeFilter) {
    query = query.eq("type", typeFilter);
  }

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
      return {
        transactions: [],
        count: 0,
        hasMore: false,
      };
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
  return {
    transactions,
    count: transactions.length,
    hasMore: transactions.length === requestedLimit,
  };
}
