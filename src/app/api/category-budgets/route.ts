import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { verifySessionToken } from "@/lib/session";
import { categoryBudgetSchema } from "@/lib/validations";

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
      .from("category_budgets")
      .select("*")
      .order("category_name", { ascending: true });

    if (error) throw error;
    return NextResponse.json(
      { budgets: data || [] },
      {
        headers: {
          "Cache-Control": "private, max-age=120, stale-while-revalidate=600",
        },
      }
    );
  } catch (error: any) {
    console.error("[API category-budgets GET error]:", error);
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
    const parsed = categoryBudgetSchema.safeParse(rawBody);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin
      .from("category_budgets")
      .upsert(
        {
          category_name: parsed.data.category_name,
          monthly_limit: parsed.data.monthly_limit,
        },
        { onConflict: "category_name" }
      )
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, budget: data });
  } catch (error: any) {
    console.error("[API category-budgets POST error]:", error);
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
    const categoryName = searchParams.get("category_name");

    const supabaseAdmin = getSupabaseAdmin();
    let query = supabaseAdmin.from("category_budgets").delete();

    if (id && !isNaN(Number(id))) {
      query = query.eq("id", Number(id));
    } else if (categoryName) {
      query = query.eq("category_name", categoryName);
    } else {
      return NextResponse.json(
        { error: "Valid id or category_name is required" },
        { status: 400 }
      );
    }

    const { error } = await query;
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[API category-budgets DELETE error]:", error);
    return NextResponse.json(
      { error: getSafeErrorMessage(error) },
      { status: 500 }
    );
  }
}
