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
  clean_merchant: z.string().max(100).optional().default(""),
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
      .select("id, pattern, clean_merchant, category_name, created_at")
      .order("pattern", { ascending: true });

    if (error) {
      console.error("[API merchant-rules GET] DB error:", error);
      throw error;
    }

    // Забезпечуємо наявність обох полів (clean_merchant та normalized_name)
    const mappedRules = (data || []).map((r) => {
      const title = r.clean_merchant || r.pattern;
      return {
        ...r,
        clean_merchant: title,
        normalized_name: title,
      };
    });

    return NextResponse.json(
      { rules: mappedRules },
      {
        headers: {
          "Cache-Control": "private, max-age=60, stale-while-revalidate=300",
        },
      }
    );
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

    const { pattern, normalized_name, clean_merchant, category_name } =
      parsed.data;
    const cleanPattern = pattern.trim().toLowerCase();
    const finalCleanMerchant = (
      normalized_name ||
      clean_merchant ||
      cleanPattern
    ).trim();

    const supabase = getSupabaseAdmin();
    // Перевіряємо case-insensitive збіг патерну, щоб запобігти дублюванню (наприклад: Ovatsiia та ovatsiia)
    const { data: existingRule } = await supabase
      .from("merchant_rules")
      .select("id")
      .ilike("pattern", cleanPattern)
      .maybeSingle();

    let data, error;
    if (existingRule) {
      const res = await supabase
        .from("merchant_rules")
        .update({
          pattern: cleanPattern,
          clean_merchant: finalCleanMerchant,
          category_name: category_name.trim(),
        })
        .eq("id", existingRule.id)
        .select()
        .single();
      data = res.data;
      error = res.error;
    } else {
      const res = await supabase
        .from("merchant_rules")
        .insert({
          pattern: cleanPattern,
          clean_merchant: finalCleanMerchant,
          category_name: category_name.trim(),
        })
        .select()
        .single();
      data = res.data;
      error = res.error;
    }

    if (error) {
      console.error("[API merchant-rules POST] DB error:", error);
      throw error;
    }

    const returnedRule = {
      ...data,
      clean_merchant: data?.clean_merchant || finalCleanMerchant,
      normalized_name: data?.clean_merchant || finalCleanMerchant,
    };

    return NextResponse.json({
      success: true,
      rule: returnedRule,
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

    const cleanPattern = pattern.trim().toLowerCase();
    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from("merchant_rules")
      .delete()
      .ilike("pattern", cleanPattern);

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
