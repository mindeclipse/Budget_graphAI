import { describe, it, expect } from "vitest";
import {
  parseDateInputToIso,
  formatIsoToDisplayDate,
  parseFlexibleNumber,
} from "@/components/dashboard/InvestmentsCard";

describe("InvestmentsCard helpers", () => {
  describe("parseDateInputToIso", () => {
    it("парсить формат ДД.ММ.РРРР в ISO YYYY-MM-DD", () => {
      expect(parseDateInputToIso("25.04.2028")).toBe("2028-04-25");
      expect(parseDateInputToIso("01.12.2026")).toBe("2026-12-01");
      expect(parseDateInputToIso("5.4.2027")).toBe("2027-04-05");
    });

    it("підтримує розділювачі скісної риски та дефіса (ДД/ММ/РРРР)", () => {
      expect(parseDateInputToIso("15/05/2027")).toBe("2027-05-15");
      expect(parseDateInputToIso("10-09-2029")).toBe("2029-09-10");
    });

    it("приймає стандартний ISO YYYY-MM-DD без змін", () => {
      expect(parseDateInputToIso("2028-04-25")).toBe("2028-04-25");
    });

    it("повертає null для порожніх або некоректних рядків", () => {
      expect(parseDateInputToIso("")).toBe(null);
      expect(parseDateInputToIso("   ")).toBe(null);
      expect(parseDateInputToIso(null)).toBe(null);
      expect(parseDateInputToIso(undefined)).toBe(null);
      expect(parseDateInputToIso("не_дата")).toBe(null);
      expect(parseDateInputToIso("99.99.9999")).toBe(null);
    });
  });

  describe("formatIsoToDisplayDate", () => {
    it("форматує ISO дату в DD.MM.YYYY для зручного відображення", () => {
      expect(formatIsoToDisplayDate("2028-04-25")).toBe("25.04.2028");
      expect(formatIsoToDisplayDate("2026-12-01")).toBe("01.12.2026");
      expect(formatIsoToDisplayDate("")).toBe("");
      expect(formatIsoToDisplayDate(null)).toBe("");
    });
  });

  describe("parseFlexibleNumber", () => {
    it("парсить числа з комами, пробілами та гривневими символами", () => {
      expect(parseFlexibleNumber("21 059,29")).toBe(21059.29);
      expect(parseFlexibleNumber("23530,88")).toBe(23530.88);
      expect(parseFlexibleNumber("₴ 21 059,29")).toBe(21059.29);
      expect(parseFlexibleNumber("10000")).toBe(10000);
      expect(parseFlexibleNumber(5000)).toBe(5000);
      expect(parseFlexibleNumber("")).toBe(0);
      expect(parseFlexibleNumber(null)).toBe(0);
    });
  });
});
