import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { verifySessionToken } from "@/lib/session";
import {
  investmentAssetSchema,
  investmentAssetUpdateSchema,
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
      .from("investments")
      .select("*")
      .order("id", { ascending: true });

    if (error) throw error;
    return NextResponse.json({ investments: data || [] });
  } catch (error: any) {
    console.error("[API investments GET error]:", error);
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
    const parsed = investmentAssetSchema.safeParse(rawBody);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin
      .from("investments")
      .insert([parsed.data])
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, investment: data });
  } catch (error: any) {
    console.error("[API investments POST error]:", error);
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
    const parsed = investmentAssetUpdateSchema.safeParse(rawBody);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { id, ...updateData } = parsed.data;
    const supabaseAdmin = getSupabaseAdmin();

    const { data, error } = await supabaseAdmin
      .from("investments")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, investment: data });
  } catch (error: any) {
    console.error("[API investments PATCH error]:", error);
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
      .from("investments")
      .delete()
      .eq("id", numId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[API investments DELETE error]:", error);
    return NextResponse.json(
      { error: getSafeErrorMessage(error) },
      { status: 500 }
    );
  }
}
