import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  transactionCreateSchema,
  transactionUpdateSchema,
} from "@/lib/validations";
import { checkAuthSession, getSafeErrorMessage } from "./auth";
import { fetchTransactionsList } from "./queries";
import {
  insertTransaction,
  updateTransactionRecord,
  deleteTransactionRecord,
} from "./mutations";

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
    const rawTypeParam = searchParams.get("type");
    const isTrash = searchParams.get("trash") === "true";

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
    const result = await fetchTransactionsList(supabase, {
      fromDate,
      toDate,
      limitParam,
      offsetParam,
      rawTypeParam,
      isTrash,
    });

    return NextResponse.json(result);
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
    const transaction = await insertTransaction(supabase, parsed.data);

    return NextResponse.json({ success: true, transaction });
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

    const supabase = getSupabaseAdmin();
    const updated = await updateTransactionRecord(supabase, parsed.data);

    return NextResponse.json({ success: true, updated });
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

    const result = await deleteTransactionRecord(supabase, {
      id,
      clearTrash,
      permanent,
    });

    if ("error" in result && result.status) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status }
      );
    }

    return NextResponse.json(result);
  } catch (err: any) {
    console.error("Transaction DELETE error:", err);
    return NextResponse.json(
      { error: getSafeErrorMessage(err) },
      { status: 500 }
    );
  }
}
