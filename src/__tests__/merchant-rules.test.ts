import { describe, it, expect } from "vitest";
import { cleanMerchantRaw } from "@/lib/normalize";
import { MerchantRule } from "@/types/finance";

describe("Merchant Rules Auto-Categorization Engine", () => {
  const mockRules: MerchantRule[] = [
    {
      pattern: "СІЛЬПО",
      normalized_name: "Сільпо",
      category_name: "Продукти",
    },
    {
      pattern: "SILPO",
      normalized_name: "Сільпо",
      category_name: "Продукти",
    },
    {
      pattern: "UBER",
      normalized_name: "Uber",
      category_name: "Транспорт",
    },
    {
      pattern: "NOVA POSHTA",
      normalized_name: "Нова Пошта",
      category_name: "Покупки",
    },
    {
      pattern: "APTEKA",
      normalized_name: "Аптека",
      category_name: "Здоров'я",
    },
  ];

  function matchMerchantRule(
    rawMerchant: string,
    rules: MerchantRule[]
  ): { matched: boolean; normalized_name?: string; category_name?: string } {
    const cleaned = cleanMerchantRaw(rawMerchant);
    const lowerCleaned = cleaned.toLowerCase();
    const lowerRaw = rawMerchant.toLowerCase();

    const rule = rules.find((r) => {
      const p = r.pattern.toLowerCase();
      return lowerCleaned.includes(p) || lowerRaw.includes(p);
    });

    if (!rule) {
      return { matched: false };
    }

    return {
      matched: true,
      normalized_name: rule.normalized_name || cleaned,
      category_name: rule.category_name,
    };
  }

  it("знаходить точний або частковий збіг за патерном мерчанта", () => {
    const resultSilpo = matchMerchantRule("ТОВ СІЛЬПО ФУД КИЇВ", mockRules);
    expect(resultSilpo.matched).toBe(true);
    expect(resultSilpo.normalized_name).toBe("Сільпо");
    expect(resultSilpo.category_name).toBe("Продукти");

    const resultUber = matchMerchantRule("UBER *TRIP HELP.UBER.COM", mockRules);
    expect(resultUber.matched).toBe(true);
    expect(resultUber.normalized_name).toBe("Uber");
    expect(resultUber.category_name).toBe("Транспорт");
  });

  it("ігнорує регістр символів при пошуку правила", () => {
    const resLower = matchMerchantRule("silpo supermarket", mockRules);
    expect(resLower.matched).toBe(true);
    expect(resLower.category_name).toBe("Продукти");
  });

  it("повертає matched: false для невідомого мерчанта", () => {
    const resUnknown = matchMerchantRule("SOME UNKNOWN STORE 123", mockRules);
    expect(resUnknown.matched).toBe(false);
  });

  it("очищує pattern за допомогою cleanMerchantRaw", () => {
    const dirtyPattern = "  ТОВ  Сільпо-Фуд  KYIV #12  ";
    const cleaned = cleanMerchantRaw(dirtyPattern);
    expect(cleaned).toBe("Сільпо-Фуд");
  });

  it("підтримує як clean_merchant, так і normalized_name", () => {
    const rulesWithCleanMerchant: MerchantRule[] = [
      {
        pattern: "dk shevchenka 8",
        clean_merchant: "Doner Kebab на Шевченка",
        category_name: "Кафе та ресторани",
      },
    ];

    function matchRuleUnified(raw: string, rules: MerchantRule[]) {
      const cleaned = cleanMerchantRaw(raw);
      const lowerCleaned = cleaned.toLowerCase();
      const lowerRaw = raw.toLowerCase();
      const rule = rules.find((r) => {
        const p = r.pattern.toLowerCase();
        return lowerCleaned.includes(p) || lowerRaw.includes(p);
      });
      if (!rule) return null;
      return {
        cleanTitle: rule.clean_merchant || rule.normalized_name || cleaned,
        category: rule.category_name,
      };
    }

    const match = matchRuleUnified(
      "Dk Shevchenka 8, Львів, Львівська область",
      rulesWithCleanMerchant
    );
    expect(match).not.toBeNull();
    expect(match?.cleanTitle).toBe("Doner Kebab на Шевченка");
    expect(match?.category).toBe("Кафе та ресторани");
  });

  it("надає вищий пріоритет довшим та більш специфічним патернам", () => {
    const rules: MerchantRule[] = [
      {
        pattern: "blyzenko",
        clean_merchant: "Близенько",
        category_name: "Продукти",
      },
      {
        pattern: "blyzenko lviv ekspres",
        clean_merchant: "Близенько Експрес",
        category_name: "Продукти",
      },
    ];

    // Сортування за спаданням довжини патерна
    const sorted = [...rules].sort(
      (a, b) => (b.pattern?.length || 0) - (a.pattern?.length || 0)
    );

    const raw = "Blyzenko Lviv Ekspres #12";
    const cleaned = cleanMerchantRaw(raw);
    const matched = sorted.find((r) => {
      const p = r.pattern.toLowerCase();
      return cleaned.toLowerCase().includes(p) || raw.toLowerCase().includes(p);
    });

    expect(matched?.clean_merchant).toBe("Близенько Експрес");
  });

  it("гарантує збіг патернів незалежно від регістру (Ovatsiia vs ovatsiia)", () => {
    const rules: MerchantRule[] = [
      {
        pattern: "ovatsiia",
        clean_merchant: "Чарка",
        category_name: "Куріння",
      },
    ];

    const raw = "Ovatsiia";
    const cleaned = cleanMerchantRaw(raw);
    const matched = rules.find((r) => {
      const p = r.pattern.toLowerCase();
      return cleaned.toLowerCase().includes(p) || raw.toLowerCase().includes(p);
    });

    expect(matched).toBeDefined();
    expect(matched?.clean_merchant).toBe("Чарка");
  });
});
