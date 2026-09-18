import { CategoryType } from "@/constants/categories";
import { normalizeCategory } from "@/lib/bot/formatters";

/**
 * Застосовує правила користувача з таблиці merchant_rules
 */
export async function applyMerchantRules(
  merchantRaw: string,
  supabaseAdmin: any
): Promise<{ merchant: string; category?: CategoryType }> {
  try {
    const { data: rules } = await supabaseAdmin
      .from("merchant_rules")
      .select("pattern, clean_merchant, category_name");

    if (rules && rules.length > 0) {
      const lowerRaw = merchantRaw.toLowerCase();
      // Сортуємо від довших до коротших патернів
      const sortedRules = [...rules].sort(
        (a: any, b: any) => (b.pattern?.length || 0) - (a.pattern?.length || 0)
      );

      const matched = sortedRules.find((r: any) => {
        const p = (r.pattern || "").trim().toLowerCase();
        return p && lowerRaw.includes(p);
      });

      if (matched) {
        return {
          merchant: matched.clean_merchant || merchantRaw,
          category: normalizeCategory(matched.category_name),
        };
      }
    }
  } catch (err) {
    console.error("[Telegram Bot] Merchant rules query error:", err);
  }

  return { merchant: merchantRaw };
}
