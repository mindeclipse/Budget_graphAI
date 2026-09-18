import { SupabaseClient } from "@supabase/supabase-js";
import { cleanMerchantRaw } from "@/lib/normalize";
import { getGeminiClient, GEMINI_MODELS } from "@/lib/gemini";
import { getFastMerchantMatch } from "./heuristics";
import { classifySchema, CLASSIFY_SYSTEM_INSTRUCTION } from "./schemas";

export interface ClassificationResult {
  cleanTitle: string;
  categoryName: string;
  classificationSource:
    "fast_heuristics" | "rule_engine" | "gemini_ai" | "fallback";
  cleaned: string;
}

export async function classifyMerchant(
  supabaseAdmin: SupabaseClient,
  rawMerchant: string,
  amount: number
): Promise<ClassificationResult> {
  const cleaned = cleanMerchantRaw(rawMerchant);
  let cleanTitle = cleaned;
  let categoryName = "Інше";
  let classificationSource: ClassificationResult["classificationSource"] =
    "fallback";

  // --- ЕШЕЛОН 0: Миттєве евристичне розпізнавання популярних українських мерчантів (0 мс) ---
  const fastMatched = getFastMerchantMatch(rawMerchant, cleaned);
  if (fastMatched) {
    return {
      cleanTitle: fastMatched.cleanTitle,
      categoryName: fastMatched.categoryName,
      classificationSource: "fast_heuristics",
      cleaned,
    };
  }

  // --- ЕШЕЛОН 1: Пошук у таблиці правил merchant_rules ---
  const { data: rules } = await supabaseAdmin
    .from("merchant_rules")
    .select("pattern, clean_merchant, category_name");

  if (rules && rules.length > 0) {
    const lowerCleaned = cleaned.toLowerCase();
    const lowerRaw = rawMerchant.toLowerCase();

    // Сортуємо правила від довших до коротших патернів
    const sortedRules = [...rules].sort(
      (a, b) => (b.pattern?.length || 0) - (a.pattern?.length || 0)
    );

    const matchedRule = sortedRules.find((r) => {
      const p = (r.pattern || "").toLowerCase();
      return lowerCleaned.includes(p) || lowerRaw.includes(p);
    });

    if (matchedRule) {
      return {
        cleanTitle: matchedRule.clean_merchant || cleaned,
        categoryName: matchedRule.category_name,
        classificationSource: "rule_engine",
        cleaned,
      };
    }
  }

  // --- ЕШЕЛОН 2: Gemini API, якщо правило не спрацювало ---
  const prompt = `Мерчант: "${rawMerchant}". Очищений вигляд: "${cleaned}". Сума: ${amount || 0} ₴`;

  try {
    const ai = getGeminiClient();
    let response;
    try {
      response = await ai.models.generateContent({
        model: GEMINI_MODELS.CLASSIFICATION,
        contents: prompt,
        config: {
          systemInstruction: CLASSIFY_SYSTEM_INSTRUCTION,
          responseMimeType: "application/json",
          responseSchema: classifySchema,
          temperature: 0.1,
        },
      });
    } catch (primaryErr) {
      console.warn(
        `Primary classification model ${GEMINI_MODELS.CLASSIFICATION} failed, falling back to ${GEMINI_MODELS.FAST}:`,
        primaryErr
      );
      response = await ai.models.generateContent({
        model: GEMINI_MODELS.FAST,
        contents: prompt,
        config: {
          systemInstruction: CLASSIFY_SYSTEM_INSTRUCTION,
          responseMimeType: "application/json",
          responseSchema: classifySchema,
          temperature: 0.1,
        },
      });
    }

    const parsed = JSON.parse(response.text || "{}");
    cleanTitle = parsed.cleanTitle || cleaned;
    categoryName = parsed.categoryName || "Інше";
    classificationSource = "gemini_ai";

    // Кешуємо нове правило в базу
    const patternToSave = cleanMerchantRaw(rawMerchant || cleaned)
      .trim()
      .toLowerCase();

    if (patternToSave) {
      const { data: existingRule } = await supabaseAdmin
        .from("merchant_rules")
        .select("id")
        .ilike("pattern", patternToSave)
        .maybeSingle();

      if (existingRule) {
        await supabaseAdmin
          .from("merchant_rules")
          .update({
            pattern: patternToSave,
            clean_merchant: cleanTitle,
            category_name: categoryName,
          })
          .eq("id", existingRule.id);
      } else {
        await supabaseAdmin.from("merchant_rules").insert({
          pattern: patternToSave,
          clean_merchant: cleanTitle,
          category_name: categoryName,
        });
      }
    }
  } catch (aiErr) {
    console.error("Gemini classification failed, using fallbacks:", aiErr);
  }

  return {
    cleanTitle,
    categoryName,
    classificationSource,
    cleaned,
  };
}
