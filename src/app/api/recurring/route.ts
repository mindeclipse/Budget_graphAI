import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

async function checkAuthSession() {
  const cookieStore = await cookies();
  const session = cookieStore.get("finance_session")?.value;
  const correctPin = process.env.APP_ACCESS_PIN;
  return Boolean(correctPin && session === correctPin);
}

// CREATE: створення нового регулярного платежу
export async function POST(req: Request) {
  try {
    if (!(await checkAuthSession())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { title, amount, currency, category_name, day_of_month, is_active } =
      body;

    if (!title || amount === undefined || !day_of_month) {
      return NextResponse.json(
        { error: "Title, amount, and day_of_month are required" },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin
      .from("recurring_templates")
      .insert([
        {
          title: title.trim(),
          amount: Number(amount),
          currency: currency || "UAH",
          category_name: category_name || "Інше",
          day_of_month: Number(day_of_month),
          is_active: is_active ?? true,
        },
      ])
      .select()
      .single();

    if (error) {
      console.error("[API recurring POST] DB error:", error);
      throw error;
    }

    return NextResponse.json({ success: true, item: data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Отримати список постійних витрат
export async function GET() {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin
      .from("recurring_templates")
      .select("*")
      .order("day_of_month", { ascending: true });

    if (error) throw error;

    return NextResponse.json({ items: data || [] });
  } catch (error: any) {
    console.error("[API recurring GET] DB error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// UPDATE: зміна параметрів постійної витрати
export async function PATCH(req: Request) {
  try {
    if (!(await checkAuthSession())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id, title, amount, currency, category_name, day_of_month } =
      await req.json();
    if (!id) {
      return NextResponse.json({ error: "ID is required" }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const updateData: Record<string, any> = {
      title: title?.trim(),
      amount: Number(amount),
      category_name,
      day_of_month: Number(day_of_month),
    };
    if (currency) updateData.currency = currency;

    const { error } = await supabaseAdmin
      .from("recurring_templates")
      .update(updateData)
      .eq("id", id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE: видалення постійної витрати
export async function DELETE(req: Request) {
  try {
    if (!(await checkAuthSession())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "ID is required" }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { error } = await supabaseAdmin
      .from("recurring_templates")
      .delete()
      .eq("id", id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
