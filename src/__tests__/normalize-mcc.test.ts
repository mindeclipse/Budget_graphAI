import { describe, it, expect } from "vitest";
import { cleanMerchantRaw } from "@/lib/normalize";
import { getCategoryByMcc } from "@/lib/mcc-mapper";

describe("Merchant Normalization & MCC Mapping", () => {
  describe("cleanMerchantRaw", () => {
    it("очищає назви мерчантів від міст, терміналів та технічних позначень", () => {
      expect(cleanMerchantRaw("TOV SILPO-FOOD KYIV #124")).toBe("SILPO-FOOD");
      expect(cleanMerchantRaw("ФОП Іванов №45 LVIV")).toBe("Іванов");
      expect(cleanMerchantRaw("UBER *TRIP* 14:35")).toBe("UBER *TRIP*");
      expect(cleanMerchantRaw("OKKO AZS 24 DNIPRO")).toBe("OKKO AZS");
    });

    it("безпечно повертає порожній рядок для null або undefined або порожнього значення", () => {
      expect(cleanMerchantRaw("")).toBe("");
      expect(cleanMerchantRaw(null as any)).toBe("");
      expect(cleanMerchantRaw(undefined as any)).toBe("");
    });

    it("схлопує зайві пробіли", () => {
      expect(cleanMerchantRaw("  АТБ    Маркет   ")).toBe("АТБ Маркет");
    });
  });

  describe("getCategoryByMcc", () => {
    it("коректно мапить супермаркети та їжу (5411)", () => {
      expect(getCategoryByMcc(5411)).toBe("Продукти");
      expect(getCategoryByMcc(5412)).toBe("Продукти");
    });

    it("коректно мапить ресторани та кафе (5812, 5814)", () => {
      expect(getCategoryByMcc(5812)).toBe("Кафе та ресторани");
      expect(getCategoryByMcc(5814)).toBe("Кафе та ресторани");
    });

    it("коректно мапить транспорт та таксі (4121, 5541)", () => {
      expect(getCategoryByMcc(4121)).toBe("Транспорт");
      expect(getCategoryByMcc(5541)).toBe("Транспорт");
    });

    it("коректно мапить аптеки та здоров'я (5912)", () => {
      expect(getCategoryByMcc(5912)).toBe("Здоров'я та догляд");
    });

    it("повертає 'Інше' для невідомих MCC кодів", () => {
      expect(getCategoryByMcc(9999)).toBe("Інше");
      expect(getCategoryByMcc(0)).toBe("Інше");
    });
  });
});
