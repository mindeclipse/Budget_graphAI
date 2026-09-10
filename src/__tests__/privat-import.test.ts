import { describe, it, expect } from "vitest";
import {
  parsePrivatDate,
  parsePrivatAmount,
  sanitizeFormulaInjection,
  normalizePrivatCategory,
  parsePrivatStatementRows,
} from "@/lib/privat-parser";

// ─────────────────────────────────────────────────────────────
// parsePrivatDate
// ─────────────────────────────────────────────────────────────
describe("parsePrivatDate", () => {
  it("парсить DD.MM.YYYY HH:mm:ss (формат виписки Приват)", () => {
    const result = parsePrivatDate("08.09.2026 04:45:07");
    expect(result).toBe("2026-09-08T04:45:07.000Z");
  });

  it("парсить DD.MM.YYYY HH:mm без секунд", () => {
    const result = parsePrivatDate("07.09.2026 23:28");
    expect(result).toBe("2026-09-07T23:28:00.000Z");
  });

  it("парсить DD.MM.YYYY без часу → 12:00:00 UTC", () => {
    const result = parsePrivatDate("01.01.2026");
    expect(result).toBe("2026-01-01T12:00:00.000Z");
  });

  it("парсить Date-об'єкт від SheetJS", () => {
    const d = new Date("2026-09-08T04:45:07.000Z");
    const result = parsePrivatDate(d);
    expect(result).toBe("2026-09-08T04:45:07.000Z");
  });

  it("парсить Excel serial number", () => {
    // 46283 = 2026-09-18
    const result = parsePrivatDate(46283);
    expect(result).toMatch(/^2026-09-18/);
  });

  it("парсить 2-значний рік < 70 → 2000+", () => {
    const result = parsePrivatDate("08.09.26 04:45:07");
    expect(result).toMatch(/^2026-09-08/);
  });

  it("парсить YYYY-MM-DD формат", () => {
    const result = parsePrivatDate("2026-09-08");
    expect(result).toMatch(/^2026-09-08/);
  });

  it("повертає поточну дату для null", () => {
    const before = Date.now();
    const result = parsePrivatDate(null);
    const after = Date.now();
    const ts = new Date(result).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });
});

// ─────────────────────────────────────────────────────────────
// parsePrivatAmount
// ─────────────────────────────────────────────────────────────
describe("parsePrivatAmount", () => {
  it("парсить від'ємне число (витрата)", () => {
    const { abs, isNegative } = parsePrivatAmount(-79.98);
    expect(abs).toBe(79.98);
    expect(isNegative).toBe(true);
  });

  it("парсить позитивне число (надходження)", () => {
    const { abs, isNegative } = parsePrivatAmount(108);
    expect(abs).toBe(108);
    expect(isNegative).toBe(false);
  });

  it("парсить рядок з пробілами та UAH", () => {
    const { abs, isNegative } = parsePrivatAmount("-1 234 UAH");
    expect(abs).toBe(1234);
    expect(isNegative).toBe(true);
  });

  it("парсить рядок з комою як десятковим роздільником", () => {
    const { abs } = parsePrivatAmount("-79,98");
    expect(abs).toBeCloseTo(79.98);
  });

  it("парсить European thousands: 9.956,76 → 9956.76", () => {
    const { abs } = parsePrivatAmount("9.956,76");
    expect(abs).toBeCloseTo(9956.76);
  });

  it("парсить USA thousands: 9,956.76 → 9956.76", () => {
    const { abs } = parsePrivatAmount("9,956.76");
    expect(abs).toBeCloseTo(9956.76);
  });

  it("повертає 0 для порожнього рядка", () => {
    const { abs } = parsePrivatAmount("");
    expect(abs).toBe(0);
  });

  it("повертає 0 для null", () => {
    const { abs } = parsePrivatAmount(null);
    expect(abs).toBe(0);
  });

  it("парсить великі суми: -772", () => {
    const { abs, isNegative } = parsePrivatAmount(-772);
    expect(abs).toBe(772);
    expect(isNegative).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────
// sanitizeFormulaInjection
// ─────────────────────────────────────────────────────────────
describe("sanitizeFormulaInjection (Privat)", () => {
  it("екранує рядки що починаються з =", () => {
    expect(sanitizeFormulaInjection("=HYPERLINK(...)")).toBe(
      "'=HYPERLINK(...)"
    );
  });

  it("екранує рядки що починаються з +", () => {
    expect(sanitizeFormulaInjection("+380501234567")).toBe("'+380501234567");
  });

  it("не змінює безпечні рядки", () => {
    expect(sanitizeFormulaInjection("Aqua")).toBe("Aqua");
    expect(sanitizeFormulaInjection("Red Monkey, LVOV")).toBe(
      "Red Monkey, LVOV"
    );
  });
});

// ─────────────────────────────────────────────────────────────
// normalizePrivatCategory
// ─────────────────────────────────────────────────────────────
describe("normalizePrivatCategory", () => {
  it("нормалізує Ресторани, кафе, бари", () => {
    expect(normalizePrivatCategory("Ресторани, кафе, бари")).toBe(
      "Кафе та ресторани"
    );
  });

  it("нормалізує Супермаркети та продукти", () => {
    expect(normalizePrivatCategory("Супермаркети та продукти")).toBe(
      "Продукти"
    );
  });

  it("нормалізує Переказ на свою картку", () => {
    expect(normalizePrivatCategory("Переказ на свою картку")).toBe("Перекази");
  });

  it("нормалізує Фонди та організації", () => {
    expect(normalizePrivatCategory("Фонди та організації")).toBe(
      "Благодійність"
    );
  });

  it("повертає оригінал для невідомої категорії", () => {
    expect(normalizePrivatCategory("Нова категорія")).toBe("Нова категорія");
  });
});

// ─────────────────────────────────────────────────────────────
// parsePrivatStatementRows — інтеграційний тест за скріншотом
// ─────────────────────────────────────────────────────────────
describe("parsePrivatStatementRows", () => {
  // Заголовки як у реальній виписці
  const headers = [
    "Дата",
    "Категорія",
    "Картка",
    "Опис операції",
    "Сума в валюті картки",
    "Валюта картки",
    "Сума в валюті транзакції",
    "Валюта транзакції",
    "Залишок на кінець",
    "Валюта залишку",
  ];

  const dataRows = [
    [
      "08.09.2026 04:45:07",
      "Переказ на свою картку",
      "4627 **** **** 2001",
      "Решта від округлення витрат на Фінансова подушка",
      -8,
      "UAH",
      8,
      "UAH",
      100,
      "UAH",
    ],
    [
      "08.09.2026 04:43:48",
      "Кредити",
      "4627 **** **** 2001",
      "Часткове дострокове погашення з Оплати частинами",
      -772,
      "UAH",
      772,
      "UAH",
      108,
      "UAH",
    ],
    [
      "07.09.2026 21:47:23",
      "Супермаркети та продукти",
      "4627 **** **** 2001",
      "Близенько",
      -79.98,
      "UAH",
      79.98,
      "UAH",
      946.02,
      "UAH",
    ],
    [
      "06.09.2026 21:02:45",
      "Ресторани, кафе, бари",
      "4627 **** **** 2001",
      "DK SHEVCHENKO 8, KYIV",
      -330,
      "UAH",
      330,
      "UAH",
      1570,
      "UAH",
    ],
    // Позитивна сума — надходження
    [
      "07.09.2026 21:49:08",
      "Переказ на свою картку",
      "4627 **** **** 2001",
      "Поповнення рахунку",
      500,
      "UAH",
      500,
      "UAH",
      2070,
      "UAH",
    ],
    // Порожній рядок — має бути проігнорований
    [null, null, null, null, null, null, null, null, null, null],
  ];

  const rows = [headers, ...dataRows];

  it("повертає коректну кількість транзакцій", () => {
    const { transactions, totalRows, skippedRows } =
      parsePrivatStatementRows(rows);
    expect(transactions.length).toBe(5);
    expect(totalRows).toBe(6); // 5 даних + 1 порожній
    expect(skippedRows).toBe(1); // 1 порожній
  });

  it("правильно визначає витрату (від'ємна сума)", () => {
    const { transactions } = parsePrivatStatementRows(rows);
    const expense = transactions.find((t) =>
      t.merchant_raw.includes("Близенько")
    );
    expect(expense).toBeDefined();
    expect(expense?.type).toBe("expense");
    expect(expense?.amount).toBeCloseTo(79.98);
    expect(expense?.currency).toBe("UAH");
  });

  it("правильно визначає надходження (позитивна сума)", () => {
    const { transactions } = parsePrivatStatementRows(rows);
    const income = transactions.find((t) =>
      t.merchant_raw.includes("Поповнення рахунку")
    );
    expect(income).toBeDefined();
    expect(income?.type).toBe("income");
    expect(income?.amount).toBe(500);
  });

  it("нормалізує категорії", () => {
    const { transactions } = parsePrivatStatementRows(rows);
    const prod = transactions.find((t) => t.merchant_raw.includes("Близенько"));
    expect(prod?.category_name).toBe("Продукти");

    const resto = transactions.find((t) =>
      t.merchant_raw.includes("DK SHEVCHENKO")
    );
    expect(resto?.category_name).toBe("Кафе та ресторани");
  });

  it("генерує унікальні external_id", () => {
    const { transactions } = parsePrivatStatementRows(rows);
    const ids = transactions.map((t) => t.external_id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it("source = privatbank_statement для всіх", () => {
    const { transactions } = parsePrivatStatementRows(rows);
    expect(transactions.every((t) => t.source === "privatbank_statement")).toBe(
      true
    );
  });

  it("exclude_from_budget = false для всіх", () => {
    const { transactions } = parsePrivatStatementRows(rows);
    expect(transactions.every((t) => t.exclude_from_budget === false)).toBe(
      true
    );
  });

  it("повертає пустий масив для порожнього input", () => {
    expect(parsePrivatStatementRows([]).transactions).toHaveLength(0);
    expect(parsePrivatStatementRows([[]]).transactions).toHaveLength(0);
  });

  it("ігнорує рядки без дати та суми (заголовок не знайдений)", () => {
    const noHeader = [
      ["Якийсь текст", "ще текст"],
      [100, 200],
    ];
    expect(parsePrivatStatementRows(noHeader).transactions).toHaveLength(0);
  });
});
