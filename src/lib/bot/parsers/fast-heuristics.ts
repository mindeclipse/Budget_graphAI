import { ParsedTelegramExpense } from "@/lib/bot/types";

/**
 * Швидкий детермінований парсинг для типових фінансових повідомлень
 * (миттєва відповідь без затримок та залежності від мережевих збоїв AI)
 */
export function tryFastNaturalLanguageParse(
  text: string,
  referenceDate: Date = new Date()
): ParsedTelegramExpense | null {
  const trimmed = text.trim();
  const isoNow = referenceDate.toISOString();

  // 1. Повернення коштів: "повернення коштів від Кохана 250", "повернення 250", "повернення від Олі 300 грн"
  const refundMatch = trimmed.match(
    /^повернення(?:\s+коштів)?(?:\s+від\s+([a-zA-Zа-яА-ЯіїєґІЇЄҐ'\s]+?))?\s+(\d+(?:[.,]\d+)?)\s*(?:грн|uah)?$/i
  );
  if (refundMatch) {
    const fromPerson = refundMatch[1]?.trim();
    const amount = parseFloat(refundMatch[2].replace(",", "."));
    if (!isNaN(amount) && amount > 0) {
      return {
        amount,
        merchant: fromPerson ? fromPerson : "Повернення коштів",
        category: "Зарплата/ФОП",
        type: "income",
        date: isoNow,
        note: fromPerson
          ? `повернення коштів від ${fromPerson}`
          : "повернення коштів",
      };
    }
  }

  // 2. Зарахування / Дохід / Поповнення: "зарахування 250", "дохід 5000", "поповнення 1000"
  const incomeMatch = trimmed.match(
    /^(?:зарахування|дохід|поповнення|надходження)(?:\s+(?:на\s+картку|на\s+рахунок))?\s+(\d+(?:[.,]\d+)?)\s*(?:грн|uah)?$/i
  );
  if (incomeMatch) {
    const amount = parseFloat(incomeMatch[1].replace(",", "."));
    if (!isNaN(amount) && amount > 0) {
      return {
        amount,
        merchant: "Зарахування коштів",
        category: "Зарплата/ФОП",
        type: "income",
        date: isoNow,
        note: "зарахування",
      };
    }
  }

  // 3. Зарплата / Аванс: "зарплата 45000", "аванс 15000"
  const salaryMatch = trimmed.match(
    /^(?:зарплата|зп|аванс)(?:\s+від\s+([a-zA-Zа-яА-ЯіїєґІЇЄҐ'\s]+?))?\s+(\d+(?:[.,]\d+)?)\s*(?:грн|uah)?$/i
  );
  if (salaryMatch) {
    const fromCompany = salaryMatch[1]?.trim();
    const amount = parseFloat(salaryMatch[2].replace(",", "."));
    if (!isNaN(amount) && amount > 0) {
      return {
        amount,
        merchant: fromCompany || "Зарплата",
        category: "Зарплата/ФОП",
        type: "income",
        date: isoNow,
        note: "зарплата",
      };
    }
  }

  return null;
}
