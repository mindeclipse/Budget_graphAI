import { sanitizeFormulaInjection } from "@/lib/security";

export { sanitizeFormulaInjection };

/**
 * Парсить дату з виписки Inzhur:
 * - Об'єкти Date (від SheetJS при cellDates: true)
 * - Серійні номери Excel (наприклад, 46034 для 12.01.2026, 46275 для 10.09.2026)
 * - Рядкові дати: DD.MM.YYYY, DD.MM.YY, YYYY-MM-DD, M/D/YY, текстові місяці українською
 * Встановлює 12:00:00 UTC для уникнення зсувів часових поясів через північ
 */
export function parseInzhurDate(rawVal: any): string {
  if (!rawVal) return new Date().toISOString();

  if (rawVal instanceof Date) {
    if (isNaN(rawVal.getTime())) return new Date().toISOString();
    const y = rawVal.getUTCFullYear();
    const m = rawVal.getUTCMonth();
    const d = rawVal.getUTCDate();
    return new Date(Date.UTC(y, m, d, 12, 0, 0)).toISOString();
  }

  // Перевірка серійного номера Excel (число або числовий рядок 30000..100000)
  const numVal =
    typeof rawVal === "number"
      ? rawVal
      : typeof rawVal === "string" && /^\d+(\.\d+)?$/.test(rawVal.trim())
        ? parseFloat(rawVal.trim())
        : null;

  if (numVal !== null && numVal >= 30000 && numVal <= 100000) {
    // В Excel епоха починається з 1899-12-30 UTC (25569 днів до Unix-епохи)
    const ms = Math.round((numVal - 25569) * 86400 * 1000);
    const d = new Date(ms);
    if (!isNaN(d.getTime())) {
      const y = d.getUTCFullYear();
      const m = d.getUTCMonth();
      const day = d.getUTCDate();
      return new Date(Date.UTC(y, m, day, 12, 0, 0)).toISOString();
    }
  }

  const str = String(rawVal).trim();

  // 1. Формат DD.MM.YYYY або DD.MM.YY (або з дефісами / слешами)
  const matchDmy = str.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
  if (matchDmy) {
    const day = parseInt(matchDmy[1], 10);
    const month = parseInt(matchDmy[2], 10);
    let year = parseInt(matchDmy[3], 10);
    if (year < 100) year = year > 70 ? 1900 + year : 2000 + year;
    const d = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    if (!isNaN(d.getTime())) return d.toISOString();
  }

  // 2. Формат YYYY-MM-DD або YYYY.MM.DD
  const matchYmd = str.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})/);
  if (matchYmd) {
    const year = parseInt(matchYmd[1], 10);
    const month = parseInt(matchYmd[2], 10);
    const day = parseInt(matchYmd[3], 10);
    const d = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    if (!isNaN(d.getTime())) return d.toISOString();
  }

  // 3. Формат з українськими назвами місяців (наприклад "10 вер. 2026" або "10 вересня 2026")
  const ukMonths: Record<string, number> = {
    січ: 1,
    лют: 2,
    бер: 3,
    кві: 4,
    тра: 5,
    чер: 6,
    лип: 7,
    сер: 8,
    вер: 9,
    жов: 10,
    лис: 11,
    гру: 12,
  };
  const matchUk = str
    .toLowerCase()
    .match(/^(\d{1,2})\s+([а-яіїєґ]+)\.?\s+(\d{2,4})/);
  if (matchUk) {
    const day = parseInt(matchUk[1], 10);
    const month = ukMonths[matchUk[2].slice(0, 3)];
    let year = parseInt(matchUk[3], 10);
    if (year < 100) year = year > 70 ? 1900 + year : 2000 + year;
    if (month) {
      const d = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
      if (!isNaN(d.getTime())) return d.toISOString();
    }
  }

  // 4. Стандартний JS Date fallback
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth();
    const day = d.getUTCDate();
    return new Date(Date.UTC(y, m, day, 12, 0, 0)).toISOString();
  }

  return new Date().toISOString();
}

/**
 * Очищує та надійно конвертує числові рядки або числа Inzhur:
 * - Числа: 9956.76, 35097.15
 * - Рядки з пробілами / символами валют: "35 097,15₴", "190,37 ₴"
 * - Європейський формат з крапкою як роздільником тисяч: "9.956,76₴" -> 9956.76
 * - Формат США з комою як роздільником тисяч: "9,956.76" -> 9956.76
 */
export function parseInzhurAmount(val: any): number {
  if (val == null) return 0;
  if (typeof val === "number") return isNaN(val) ? 0 : Math.abs(val);

  let s = String(val)
    .trim()
    .replace(/[\s\u00A0₴$€]/g, "");
  if (!s) return 0;

  // Європейський формат: 9.956,76 або 1.000.000,00 (крапка - тисячі, кома - десяткові)
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) {
    s = s.replace(/\./g, "").replace(",", ".");
  }
  // Формат США: 9,956.76 (кома - тисячі, крапка - десяткові)
  else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) {
    s = s.replace(/,/g, "");
  }
  // Якщо є кома і немає крапки: "190,37" -> "190.37"
  else if (s.includes(",") && !s.includes(".")) {
    s = s.replace(",", ".");
  }
  // Якщо кілька крапок (наприклад 1.000.000): залишаємо лише останню як десяткову
  else if ((s.match(/\./g) || []).length > 1) {
    const lastDot = s.lastIndexOf(".");
    s =
      s.substring(0, lastDot).replace(/\./g, "") +
      "." +
      s.substring(lastDot + 1);
  }

  const num = parseFloat(s);
  return isNaN(num) ? 0 : Math.abs(num);
}
