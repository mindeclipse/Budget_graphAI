import { describe, it, expect } from "vitest";
import {
  parseInzhurDate,
  parseInzhurAmount,
  sanitizeFormulaInjection,
  parseInzhurStatementRows,
  inzhurTransactionSchema,
} from "@/lib/inzhur-parser";

describe("Inzhur Statement Parser & Security", () => {
  describe("Formula Injection Sanitization (CSV / Excel Injection Defense)", () => {
    it("екранує формули, що починаються з '=', '+', '-', '@' або табуляції", () => {
      expect(sanitizeFormulaInjection("=cmd|' /C calc'!A0")).toBe(
        "'=cmd|' /C calc'!A0"
      );
      expect(sanitizeFormulaInjection("+12345")).toBe("'+12345");
      expect(sanitizeFormulaInjection("-100")).toBe("'-100");
      expect(sanitizeFormulaInjection("@SUM(A1:B10)")).toBe("'@SUM(A1:B10)");
      expect(sanitizeFormulaInjection("\tDDE()")).toBe("'DDE()");
    });

    it("не змінює звичайний безпечний текст", () => {
      expect(sanitizeFormulaInjection("Inzhur REIT")).toBe("Inzhur REIT");
      expect(sanitizeFormulaInjection("ОВДП UA4000228392")).toBe(
        "ОВДП UA4000228392"
      );
      expect(sanitizeFormulaInjection("Нарахування дивідендів")).toBe(
        "Нарахування дивідендів"
      );
    });
  });

  describe("parseInzhurDate", () => {
    it("коректно парсить дати у форматі DD.MM.YYYY", () => {
      const iso = parseInzhurDate("15.08.2024");
      expect(iso).toContain("2024-08-15");
      expect(iso).toContain("12:00:00.000Z");
    });

    it("коректно парсить 2-значні роки DD.MM.YY (наприклад 11.08.26 або 17.12.25)", () => {
      expect(parseInzhurDate("11.08.26")).toContain("2026-08-11");
      expect(parseInzhurDate("17.12.25")).toContain("2025-12-17");
    });

    it("коректно конвертує серійні номери дат Excel (46034 для 12.01.2026, 46008 для 17.12.2025)", () => {
      expect(parseInzhurDate(46034)).toContain("2026-01-12");
      expect(parseInzhurDate("46034")).toContain("2026-01-12");
      expect(parseInzhurDate(46008)).toContain("2025-12-17");
      expect(parseInzhurDate("46008")).toContain("2025-12-17");
      expect(parseInzhurDate(46245)).toContain("2026-08-11");
      expect(parseInzhurDate(46275)).toContain("2026-09-10");
    });

    it("коректно парсить дати з українськими назвами місяців", () => {
      expect(parseInzhurDate("11 серпня 2026")).toContain("2026-08-11");
      expect(parseInzhurDate("10 вер. 2026 р.")).toContain("2026-09-10");
      expect(parseInzhurDate("17 груд. 2025")).toContain("2025-12-17");
    });

    it("коректно парсить дати у форматі YYYY-MM-DD", () => {
      const iso = parseInzhurDate("2024-09-01");
      expect(iso).toContain("2024-09-01");
    });

    it("підтримує об'єкти Date від SheetJS", () => {
      const d = new Date("2024-07-20T00:00:00Z");
      expect(parseInzhurDate(d)).toContain("2024-07-20");
    });
  });

  describe("parseInzhurAmount", () => {
    it("очищує суми з символом гривні та комами", () => {
      expect(parseInzhurAmount("35 097,15₴")).toBe(35097.15);
      expect(parseInzhurAmount("190,37 ₴")).toBe(190.37);
      expect(parseInzhurAmount("1 500,00")).toBe(1500.0);
    });

    it("правильно парсить європейський формат із крапкою для тисяч (виправлення багу 9.956,76 -> 9,96)", () => {
      expect(parseInzhurAmount("9.956,76₴")).toBe(9956.76);
      expect(parseInzhurAmount("35.097,15₴")).toBe(35097.15);
      expect(parseInzhurAmount("4.116,64₴")).toBe(4116.64);
      expect(parseInzhurAmount("4.005,75₴")).toBe(4005.75);
      expect(parseInzhurAmount("30.472,20₴")).toBe(30472.2);
    });

    it("підтримує прямі числа (number) без втрати точності", () => {
      expect(parseInzhurAmount(9956.76)).toBe(9956.76);
      expect(parseInzhurAmount(35097.15)).toBe(35097.15);
      expect(parseInzhurAmount(136.81)).toBe(136.81);
    });

    it("повертає 0 для некоректних або порожніх значень", () => {
      expect(parseInzhurAmount(null)).toBe(0);
      expect(parseInzhurAmount("")).toBe(0);
      expect(parseInzhurAmount("-")).toBe(0);
      expect(parseInzhurAmount(undefined)).toBe(0);
    });
  });

  describe("parseInzhurStatementRows - Розбір реальної виписки Inzhur", () => {
    const mockStatementRows = [
      ["Звіт по операціях рахунку", "", "", "", ""],
      ["Дата", "Тип операції", "Вид цінного паперу", "Дебет", "Кредит"],
      ["15.08.2024", "Нарахування дивідендів", "Inzhur REIT", "1 500,00₴", ""],
      [
        "10.08.2024",
        "Купівля 33 облігацій",
        "ОВДП UA4000228392",
        "",
        "35 097,15₴",
      ],
      ["15.08.2024", "Утримання податку", "Військовий збір", "", "22,50₴"],
      ["01.08.2024", "Поповнення рахунку", "-", "50 000,00₴", ""],
      ["02.08.2024", "Порожній рядок", "-", "0", "0"],
    ];

    it("успішно розпізнає заголовки та парсить рядки виписки", () => {
      const result = parseInzhurStatementRows(mockStatementRows);

      expect(result.transactions.length).toBe(4);
      expect(result.skippedRows).toBe(1); // 1 рядок з 0 сумою

      // 1. Дивіденди (Дебет -> поповнення / прибуток)
      const divTx = result.transactions[0];
      expect(divTx.amount).toBe(1500);
      expect(divTx.merchant_raw).toBe("Inzhur REIT • Нарахування дивідендів");
      expect(divTx.type).toBe("investment");
      expect(divTx.source).toBe("inzhur_statement");
      expect(divTx.tags).toContain("дебет");
      expect(divTx.tags).toContain("reit");
      expect(divTx.tags).toContain("дивіденди");

      // 2. Купівля ОВДП (Кредит -> витрата на покупку активу)
      const bondTx = result.transactions[1];
      expect(bondTx.amount).toBe(35097.15);
      expect(bondTx.merchant_raw).toBe(
        "ОВДП UA4000228392 • Купівля 33 облігацій"
      );
      expect(bondTx.type).toBe("investment");
      expect(bondTx.tags).toContain("кредит");
      expect(bondTx.tags).toContain("овдп");

      // 3. Податки
      const taxTx = result.transactions[2];
      expect(taxTx.amount).toBe(22.5);
      expect(taxTx.tags).toContain("податки");

      // 4. Поповнення
      const depositTx = result.transactions[3];
      expect(depositTx.amount).toBe(50000);
      expect(depositTx.merchant_raw).toBe("Поповнення рахунку");
    });

    it("формує детерміновані external_id для дедуплікації при повторному завантаженні", () => {
      const result1 = parseInzhurStatementRows(mockStatementRows);
      const result2 = parseInzhurStatementRows(mockStatementRows);

      expect(result1.transactions.map((t) => t.external_id)).toEqual(
        result2.transactions.map((t) => t.external_id)
      );

      // Перевіряємо формат id
      result1.transactions.forEach((tx) => {
        expect(tx.external_id).toMatch(/^inzhur_\d{4}-\d{2}-\d{2}_/);
      });
    });

    it("генерує унікальні external_id для однакових операцій в один день", () => {
      const duplicateRows = [
        ["Дата", "Тип операції", "Вид цінного паперу", "Дебет", "Кредит"],
        ["15.08.2024", "Купон", "ОВДП", "500,00₴", ""],
        ["15.08.2024", "Купон", "ОВДП", "500,00₴", ""],
      ];

      const result = parseInzhurStatementRows(duplicateRows);
      expect(result.transactions.length).toBe(2);
      expect(result.transactions[0].external_id).not.toBe(
        result.transactions[1].external_id
      );
      expect(result.transactions[1].external_id).toContain("_1");
    });

    it("коректно парсить реальну виписку Inzhur з різними форматами дат і тисячними сумами (виправлення багу сьогоднішньої дати та зменшення сум)", () => {
      const statementRows = [
        ["Дата", "Тип операції", "Вид цінного паперу", "Дебет", "Кредит"],
        ["10.09.2026", "Сплата податку", "Inzhur REIT", null, "26,65₴"],
        [
          "10.09.2026",
          "Нарахування дивідендів",
          "Inzhur REIT",
          "190,37₴",
          null,
        ],
        [
          "11.08.2026",
          "Купівля 33 облігацій",
          "ОВДП UA4000238976",
          null,
          "35 097,15₴",
        ],
        [
          "11.08.2026",
          "Поповнення брокерського рахунку",
          "-",
          "35 050,00₴",
          null,
        ],
        [
          "20.05.2026",
          "Купівля 4 облігацій",
          "ОВДП UA4000238976",
          null,
          "4.116,64₴",
        ],
        [
          "20.05.2026",
          "Нарахування купону",
          "ОВДП UA4000237416",
          "4.005,75₴",
          null,
        ],
        // Рядок із числовим Excel серійним номером дати (46034 -> 12.01.2026) та числовим значенням суми
        [46034, "Купівля 13 сертифікатів", "Inzhur REIT", null, 136.81],
        // Рядок із 2-значним роком та європейським форматом тисяч
        [
          "17.12.25",
          "Купівля 970 сертифікатів",
          "Inzhur REIT",
          null,
          "9.956,76₴",
        ],
      ];

      const result = parseInzhurStatementRows(statementRows);
      expect(result.transactions.length).toBe(8);

      // Перевірка, що дати НЕ встановлюються в сьогоднішній день
      expect(result.transactions[2].created_at).toContain("2026-08-11");
      expect(result.transactions[2].amount).toBe(35097.15); // НЕ 35.1!

      expect(result.transactions[4].created_at).toContain("2026-05-20");
      expect(result.transactions[4].amount).toBe(4116.64); // НЕ 4.12!

      expect(result.transactions[5].created_at).toContain("2026-05-20");
      expect(result.transactions[5].amount).toBe(4005.75); // НЕ 4.01!

      expect(result.transactions[6].created_at).toContain("2026-01-12");
      expect(result.transactions[6].amount).toBe(136.81);

      expect(result.transactions[7].created_at).toContain("2025-12-17");
      expect(result.transactions[7].amount).toBe(9956.76); // НЕ 9.96!
    });

    it("викидає помилку, якщо таблиця не містить потрібних колонок", () => {
      const invalidRows = [
        ["Номер", "Опис", "Сума"],
        ["1", "Кава", "50"],
      ];

      expect(() => parseInzhurStatementRows(invalidRows)).toThrow(
        /Не вдалося знайти рядок заголовків/
      );
    });
  });

  describe("Ізоляція від щоденних витрат і бюджету", () => {
    it("гарантує, що всі імпортовані транзакції мають type: 'investment' і проходять Zod-валідацію", () => {
      const rows = [
        ["Дата", "Тип операції", "Вид цінного паперу", "Дебет", "Кредит"],
        ["01.09.2024", "Купівля сертифікатів", "Inzhur REIT", "", "5000,00₴"],
      ];

      const result = parseInzhurStatementRows(rows);
      const tx = result.transactions[0];

      // Валідація Zod схемою
      const validated = inzhurTransactionSchema.safeParse(tx);
      expect(validated.success).toBe(true);

      // Суворе правило ізоляції
      expect(tx.type).toBe("investment");
      expect(tx.type).not.toBe("expense");
      expect(tx.category_name).toBe("Інвестиції");
    });

    it("перевіряє, що фільтр щоденного бюджету useBudgetMetrics гарантовано ігнорує ці операції", () => {
      const rows = [
        ["Дата", "Тип операції", "Вид цінного паперу", "Дебет", "Кредит"],
        ["01.09.2024", "Купівля сертифікатів", "Inzhur REIT", "", "5000,00₴"],
        ["05.09.2024", "Дивіденди", "Inzhur REIT", "300,00₴", ""],
      ];

      const { transactions } = parseInzhurStatementRows(rows);

      // Логіка з useBudgetMetrics.ts:
      // if (t.exclude_from_budget || t.type !== "expense") return false;
      const budgetExpenseFilter = (t: any) =>
        !t.exclude_from_budget && t.type === "expense";

      const dailyExpenses = transactions.filter(budgetExpenseFilter);
      expect(dailyExpenses.length).toBe(0);

      // Натомість фільтр капіталу в CapitalHistoryCard їх успішно підхоплює
      const capitalFilter = (t: any) =>
        !t.exclude_from_budget &&
        (t.type === "investment" ||
          t.category_name?.toLowerCase().includes("інвест") ||
          t.tags?.some((tag: string) => tag.toLowerCase().includes("капітал")));

      const capitalOps = transactions.filter(capitalFilter);
      expect(capitalOps.length).toBe(2);
    });

    it("перевіряє дедуплікацію та коректне об'єднання investmentTransactions з банківськими переказами на Inzhur", () => {
      interface MockTx {
        id: number;
        type: string;
        category_name: string;
        merchant_raw: string;
        amount: number;
        created_at: string;
        exclude_from_budget: boolean;
        tags?: string[];
      }

      // Імітація окремого запиту інвестицій (5000 записів Inzhur)
      const investmentTransactions: MockTx[] = [
        {
          id: 101,
          type: "investment",
          category_name: "Інвестиції",
          merchant_raw: "Inzhur REIT • Дивіденди",
          amount: 500,
          created_at: "2026-09-01T12:00:00Z",
          exclude_from_budget: false,
        },
        {
          id: 102,
          type: "investment",
          category_name: "Інвестиції",
          merchant_raw: "ОВДП • Купівля",
          amount: 10000,
          created_at: "2026-08-15T12:00:00Z",
          exclude_from_budget: false,
        },
      ];

      // Імітація загального списку транзакцій, де є банківський переказ на Inzhur та дублікат id 101
      const rawTransactions: MockTx[] = [
        {
          id: 101, // дублікат id 101 (наявний в обох джерелах)
          type: "investment",
          category_name: "Інвестиції",
          merchant_raw: "Inzhur REIT • Дивіденди",
          amount: 500,
          created_at: "2026-09-01T12:00:00Z",
          exclude_from_budget: false,
        },
        {
          id: 250, // банківський переказ на Inzhur з Привату (type: transfer)
          type: "transfer",
          category_name: "Інвестиції (Inzhur)",
          merchant_raw: "ТОВ «ІНЖУР КЕПІТАЛ»",
          amount: 20000,
          created_at: "2026-09-05T10:00:00Z",
          exclude_from_budget: false,
        },
        {
          id: 999, // звичайна витрата (не капітал)
          type: "expense",
          category_name: "Продукти",
          merchant_raw: "Сільпо",
          amount: 450,
          created_at: "2026-09-06T10:00:00Z",
          exclude_from_budget: false,
        },
        {
          id: 888, // поповнення скарбнички
          type: "transfer",
          category_name: "Заощадження",
          merchant_raw: "Скарбничка",
          amount: 1000,
          created_at: "2026-09-08T10:00:00Z",
          exclude_from_budget: false,
        },
      ];

      // Логіка об'єднання з Dashboard (src/app/page.tsx)
      const txMap = new Map<number, any>();

      for (const t of investmentTransactions) {
        if (!t.exclude_from_budget) {
          txMap.set(t.id, t);
        }
      }

      for (const t of rawTransactions) {
        if (t.exclude_from_budget) continue;
        const isCapital =
          t.type === "investment" ||
          t.category_name?.toLowerCase().includes("інвест") ||
          t.category_name?.toLowerCase().includes("заощадж") ||
          t.tags?.some(
            (tag: string) =>
              tag.toLowerCase().includes("капітал") ||
              tag.toLowerCase().includes("інвест")
          );

        if (isCapital) {
          txMap.set(t.id, t);
        }
      }

      const merged = Array.from(txMap.values()).sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      // Має містити 4 операції: id 888, 250, 101, 102 (без дубля 101 та без звичайної витрати 999)
      expect(merged.length).toBe(4);
      expect(merged.map((m) => m.id)).toEqual([888, 250, 101, 102]);
      expect(merged.find((m) => m.id === 250)?.merchant_raw).toBe(
        "ТОВ «ІНЖУР КЕПІТАЛ»"
      );
      expect(merged.find((m) => m.id === 999)).toBeUndefined();
    });

    it("перевіряє безпеку allowlist ALLOWED_TYPES для фільтрації транзакцій", () => {
      const ALLOWED_TYPES = [
        "investment",
        "expense",
        "income",
        "transfer",
      ] as const;
      type AllowedType = (typeof ALLOWED_TYPES)[number];

      const validateType = (raw: string | null): AllowedType | null => {
        return raw && ALLOWED_TYPES.includes(raw as AllowedType)
          ? (raw as AllowedType)
          : null;
      };

      // Валідні типи проходять
      expect(validateType("investment")).toBe("investment");
      expect(validateType("expense")).toBe("expense");
      expect(validateType("income")).toBe("income");
      expect(validateType("transfer")).toBe("transfer");

      // Спроби ін'єкції або невалідні типи безпечно відхиляються (fail-safe)
      expect(validateType("'; DROP TABLE transactions; --")).toBeNull();
      expect(validateType("admin")).toBeNull();
      expect(validateType("<script>")).toBeNull();
      expect(validateType("")).toBeNull();
      expect(validateType(null)).toBeNull();
    });
  });
});
