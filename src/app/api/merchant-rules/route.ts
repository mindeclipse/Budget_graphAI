import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { verifySessionToken } from "@/lib/session";
import { z } from "zod";

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

const ruleSchema = z.object({
  pattern: z.string().min(1, "Паттерн не може бути порожнім").max(100),
  normalized_name: z.string().max(100).optional().default(""),
  category_name: z.string().min(1, "Категорія обов'язкова").max(50),
});

export async function GET() {
  try {
    if (!(await checkAuthSession())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("merchant_rules")
      .select("*")
      .order("pattern", { ascending: true });

    if (error) {
      console.error("[API merchant-rules GET] DB error:", error);
      throw error;
    }

    return NextResponse.json({ rules: data || [] });
  } catch (err: any) {
    console.error("Merchant rules GET error:", err);
    return NextResponse.json(
      { error: getSafeErrorMessage(err) },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!(await checkAuthSession())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rawBody = await req.json();
    const parsed = ruleSchema.safeParse(rawBody);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { pattern, normalized_name, category_name } = parsed.data;
    // Патерн зберігаємо як є (trim + lowercase) — НЕ очищаємо через cleanMerchantRaw,
    // бо та функція призначена для чеків банку і видаляє цифри, міста тощо.
    // Користувач вводить патерн навмисно — зберігаємо точно.
    const cleanPattern = pattern.trim().toLowerCase();
    const finalNormalized = normalized_name?.trim() || cleanPattern;

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("merchant_rules")
      .upsert(
        {
          pattern: cleanPattern,
          normalized_name: finalNormalized,
          category_name: category_name.trim(),
        },
        { onConflict: "pattern" }
      )
      .select()
      .single();

    if (error) {
      console.error("[API merchant-rules POST] DB error:", error);
      throw error;
    }

    return NextResponse.json({
      success: true,
      rule: data,
      message: "Правило мерчанта збережено",
    });
  } catch (err: any) {
    console.error("Merchant rules POST error:", err);
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

    const { searchParams } = new URL(req.url);
    const pattern = searchParams.get("pattern");

    if (!pattern || !pattern.trim()) {
      return NextResponse.json(
        { error: "Pattern is required for deletion" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from("merchant_rules")
      .delete()
      .eq("pattern", pattern.trim());

    if (error) {
      console.error("[API merchant-rules DELETE] DB error:", error);
      throw error;
    }

    return NextResponse.json({
      success: true,
      deletedPattern: pattern.trim(),
      message: "Правило успішно видалено",
    });
  } catch (err: any) {
    console.error("Merchant rules DELETE error:", err);
    return NextResponse.json(
      { error: getSafeErrorMessage(err) },
      { status: 500 }
    );
  }
}
