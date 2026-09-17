import { CATEGORIES, CategoryType } from "@/constants/categories";
import { escapeHtml, timingSafeEqual } from "@/lib/security";
import {
  TelegramReplyMarkup,
  TelegramInlineKeyboardButton,
} from "@/lib/telegram";
import { DailyBudgetInfo } from "@/lib/classify-formatter";
import {
  WeightedPacingResult,
  PurchaseSimulationResult,
  isWeekendOrLeisureDay,
} from "@/lib/weighted-pacing";
import { getKyivDayOfWeek } from "@/lib/behavioral-metrics";

export const CATEGORY_EMOJIS: Record<string, string> = {
  Продукти: "🛒",
  "Кафе та ресторани": "🍽",
  Куріння: "🚬",
  Транспорт: "🚕",
  Авто: "⛽️",
  "Одяг та взуття": "👕",
  "Здоров'я та догляд": "💊",
  Доставка: "📦",
  "Оренда та комуналка": "🏠",
  "Підписки та сервіси": "📱",
  "Освіта та книги": "📚",
  "Розваги та хобі": "🎉",
  Покупки: "🛍",
  Інвестиції: "📈",
  "Зарплата/ФОП": "💼",
  Інше: "🌀",

  // Сумісність
  "Здоров'я": "💊",
};

/**
 * Перевірка валідності секретного токена вебхука Telegram із захистом від Timing Attacks
 */
export function validateTelegramWebhookSecret(
  secretHeader: string | null,
  configuredSecret?: string
): boolean {
  if (configuredSecret) {
    if (!secretHeader) return false;
    return timingSafeEqual(secretHeader, configuredSecret);
  }
  return true;
}

export function getCategoryEmoji(category: string): string {
  return (CATEGORY_EMOJIS as Record<string, string>)[category] || "📦";
}

export function formatKyivDateTime(dateStr: string | Date): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr);
    return new Intl.DateTimeFormat("uk-UA", {
      timeZone: "Europe/Kyiv",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  } catch {
    return String(dateStr);
  }
}

export function formatKyivDate(dateStr: string | Date): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr);
    return new Intl.DateTimeFormat("uk-UA", {
      timeZone: "Europe/Kyiv",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(d);
  } catch {
    return String(dateStr);
  }
}

/**
 * Визначає часовий зсув Europe/Kyiv (наприклад +03:00 влітку або +02:00 взимку) для вказаної дати та часу
 */
export function getKyivTimezoneOffset(
  year: number,
  month: number,
  day: number,
  hour = 12,
  minute = 0
): string {
  const utcEstimate = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Kyiv",
    timeZoneName: "longOffset",
  });
  const parts = formatter.formatToParts(utcEstimate);
  const tz = parts.find((p) => p.type === "timeZoneName")?.value || "+03:00";
  return tz.replace("GMT", "");
}

/**
 * Нормалізує дату та час чеку чи квитанції з урахуванням місцевого часу Києва (Europe/Kyiv).
 * Запобігає 3-годинному хибному зсуву, коли Gemini повертає локальний час чека із закінченням Z (UTC).
 */
export function normalizeKyivReceiptDate(
  rawDateStr?: string,
  referenceDate: Date = new Date()
): string {
  if (!rawDateStr || typeof rawDateStr !== "string") {
    return referenceDate.toISOString();
  }

  const clean = rawDateStr.replace(/Z$/i, "").trim();

  // 1. Формат ISO: YYYY-MM-DD HH:MM[:SS]
  const matchIso = clean.match(
    /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/
  );
  // 2. Український формат: DD.MM.YYYY або DD/MM/YYYY HH:MM[:SS]
  const matchUk = clean.match(
    /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?:[T\s,]+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/
  );

  let y: number;
  let m: number;
  let d: number;
  let hh = 12;
  let mm = 0;
  let ss = 0;
  let hasTime = false;

  if (matchIso) {
    y = parseInt(matchIso[1], 10);
    m = parseInt(matchIso[2], 10);
    d = parseInt(matchIso[3], 10);
    if (matchIso[4] !== undefined && matchIso[5] !== undefined) {
      hh = parseInt(matchIso[4], 10);
      mm = parseInt(matchIso[5], 10);
      ss = matchIso[6] ? parseInt(matchIso[6], 10) : 0;
      hasTime = true;
    }
  } else if (matchUk) {
    d = parseInt(matchUk[1], 10);
    m = parseInt(matchUk[2], 10);
    y = parseInt(matchUk[3], 10);
    if (matchUk[4] !== undefined && matchUk[5] !== undefined) {
      hh = parseInt(matchUk[4], 10);
      mm = parseInt(matchUk[5], 10);
      ss = matchUk[6] ? parseInt(matchUk[6], 10) : 0;
      hasTime = true;
    }
  } else {
    const parsed = new Date(rawDateStr);
    return isNaN(parsed.getTime())
      ? referenceDate.toISOString()
      : parsed.toISOString();
  }

  // Якщо час не був указаний на чеку, але дата збігається із сьогоднішньою (за Києвом),
  // спадкуємо години та хвилини з referenceDate
  if (!hasTime) {
    const refKyivParts = new Intl.DateTimeFormat("en-US", {
      timeZone: "Europe/Kyiv",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      hour12: false,
    }).formatToParts(referenceDate);
    const getPart = (type: Intl.DateTimeFormatPartTypes) =>
      parseInt(refKyivParts.find((p) => p.type === type)?.value || "0", 10);
    const refY = getPart("year");
    const refM = getPart("month");
    const refD = getPart("day");
    if (refY === y && refM === m && refD === d) {
      hh = getPart("hour");
      mm = getPart("minute");
      ss = getPart("second");
    }
  }

  const pad = (n: number) => String(n).padStart(2, "0");
  const offset = getKyivTimezoneOffset(y, m, d, hh, mm);
  const isoWithOffset = `${y}-${pad(m)}-${pad(d)}T${pad(hh)}:${pad(mm)}:${pad(ss)}${offset}`;
  const finalDate = new Date(isoWithOffset);
  return isNaN(finalDate.getTime())
    ? referenceDate.toISOString()
    : finalDate.toISOString();
}

/**
 * Рендерить текстовий прогрес-бар для повідомлень Telegram
 */
export function renderProgressBar(percent: number, totalBlocks = 10): string {
  const safePercent = Math.max(0, Math.min(100, Math.round(percent)));
  const filledBlocks = Math.round((safePercent / 100) * totalBlocks);
  const emptyBlocks = Math.max(0, totalBlocks - filledBlocks);
  return `${"█".repeat(filledBlocks)}${"░".repeat(emptyBlocks)}`;
}

/**
 * Очищує JSON текст від блоків markdown ```json ... ```
 */
export function cleanJsonOutput(raw: string): string {
  return raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

/**
 * Нормалізує категорію за списком категорій
 */
export function normalizeCategory(categoryInput?: string): CategoryType {
  if (!categoryInput) return "Інше";
  const trimmed = categoryInput.trim().toLowerCase();

  // Прямий збіг
  const directMatch = CATEGORIES.find((c) => c.toLowerCase() === trimmed);
  if (directMatch) return directMatch;

  // Синоніми та розмовні скорочення категорій
  if (
    trimmed === "здоров'я" ||
    trimmed === "здоров’я" ||
    trimmed === "аптека" ||
    trimmed === "ліки" ||
    trimmed === "медицина" ||
    trimmed === "лікар"
  ) {
    return "Здоров'я та догляд";
  }
  if (
    trimmed === "розваги" ||
    trimmed === "хобі" ||
    trimmed === "відпочинок" ||
    trimmed === "кіно" ||
    trimmed === "ігри"
  ) {
    return "Розваги та хобі";
  }
  if (
    trimmed === "кафе" ||
    trimmed === "ресторан" ||
    trimmed === "ресторани" ||
    trimmed === "бар" ||
    trimmed === "кав'ярня" ||
    trimmed === "кава"
  ) {
    return "Кафе та ресторани";
  }
  if (
    trimmed === "продукти" ||
    trimmed === "їжа" ||
    trimmed === "супермаркет"
  ) {
    return "Продукти";
  }
  if (
    trimmed === "комуналка" ||
    trimmed === "оренда" ||
    trimmed === "комунальні" ||
    trimmed === "житло"
  ) {
    return "Оренда та комуналка";
  }
  if (
    trimmed === "підписки" ||
    trimmed === "підписка" ||
    trimmed === "сервіси" ||
    trimmed === "софт"
  ) {
    return "Підписки та сервіси";
  }
  if (
    trimmed === "освіта" ||
    trimmed === "книги" ||
    trimmed === "навчання" ||
    trimmed === "курси"
  ) {
    return "Освіта та книги";
  }
  if (trimmed === "одяг" || trimmed === "взуття" || trimmed === "аксесуари") {
    return "Одяг та взуття";
  }
  if (
    trimmed === "транспорт" ||
    trimmed === "таксі" ||
    trimmed === "метро" ||
    trimmed === "поїзд" ||
    trimmed === "квитки"
  ) {
    return "Транспорт";
  }
  if (
    trimmed === "авто" ||
    trimmed === "пальне" ||
    trimmed === "бензин" ||
    trimmed === "газ" ||
    trimmed === "сто" ||
    trimmed === "мийка"
  ) {
    return "Авто";
  }
  if (
    trimmed === "доставка" ||
    trimmed === "кур'єр" ||
    trimmed === "нова пошта" ||
    trimmed === "пошта"
  ) {
    return "Доставка";
  }
  if (
    trimmed === "куріння" ||
    trimmed === "сигарети" ||
    trimmed === "тютюн" ||
    trimmed === "стіки" ||
    trimmed === "вейп"
  ) {
    return "Куріння";
  }
  if (trimmed === "покупки" || trimmed === "техніка" || trimmed === "шопінг") {
    return "Покупки";
  }
  if (
    trimmed === "інвестиції" ||
    trimmed === "овдп" ||
    trimmed === "інжур" ||
    trimmed === "акції" ||
    trimmed === "депозит"
  ) {
    return "Інвестиції";
  }
  if (
    trimmed === "зарплата" ||
    trimmed === "фоп" ||
    trimmed === "дохід" ||
    trimmed === "виплата"
  ) {
    return "Зарплата/ФОП";
  }

  // Частковий збіг
  const partial = CATEGORIES.find(
    (c) =>
      c.toLowerCase().startsWith(trimmed) || trimmed.startsWith(c.toLowerCase())
  );
  return partial || "Інше";
}

/**
 * Генерує inline клавіатуру для вибору категорії
 */
export function buildCategoryKeyboard(
  txId: number,
  currentCategory?: string
): TelegramReplyMarkup {
  const keyboard: TelegramInlineKeyboardButton[][] = [];
  const chunkSize = 2;

  for (let i = 0; i < CATEGORIES.length; i += chunkSize) {
    const row = CATEGORIES.slice(i, i + chunkSize).map((cat) => {
      const idx = CATEGORIES.indexOf(cat);
      const isCurrent = cat === currentCategory;
      return {
        text: `${isCurrent ? "✓ " : ""}${getCategoryEmoji(cat)} ${cat}`,
        callback_data: `tg_setcat:${txId}:${idx}`,
      };
    });
    keyboard.push(row);
  }

  keyboard.push([
    {
      text: "⬅️ Назад",
      callback_data: `tg_back:${txId}`,
    },
  ]);

  return { inline_keyboard: keyboard };
}

/**
 * Форматує підтвердження створеної транзакції
 */
export function formatTransactionConfirmation(params: {
  transaction: any;
  dailyBudget?: DailyBudgetInfo | null;
  roundupResult?: any;
  itemsCount?: number;
}): { text: string; replyMarkup: TelegramReplyMarkup } {
  const { transaction, dailyBudget, roundupResult, itemsCount } = params;

  const emoji = getCategoryEmoji(transaction.category_name);
  const amountFormatted = `${Number(transaction.amount).toLocaleString(
    "uk-UA",
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }
  )} ₴`;

  const isIncome = transaction.type === "income";
  const isInvestment = transaction.type === "investment";
  const isExpense = !isIncome && !isInvestment;

  const isEmergency =
    Boolean(transaction.metadata?.is_emergency) ||
    (Array.isArray(transaction.tags) && transaction.tags.includes("форсмажор"));

  const amort = transaction.metadata?.amortization;

  let title = `✅ <b>Витрату записано!</b>`;
  let sign = "";
  if (isIncome) {
    title = `💵 <b>Дохід зараховано!</b>`;
    sign = "+";
  } else if (isInvestment) {
    title = `📈 <b>Інвестицію зафіксовано!</b>`;
  }

  const lines = [
    title,
    ``,
    `💳 <b>${escapeHtml(transaction.merchant_raw)}</b>: <b>${sign}${amountFormatted}</b>`,
    `🏷 Категорія: ${emoji} <b>${escapeHtml(transaction.category_name)}</b>`,
    `📅 ${formatKyivDateTime(transaction.created_at)}`,
  ];

  if (isEmergency) {
    lines.push(
      ``,
      `🛡️ <b>Форс-мажор (екстрена витрата)</b>`,
      `💡 <i>Враховано в бюджеті. ШІ та аналітика зафіксують це як вимушену потребу, а не споживче марнотратство.</i>`
    );
  } else if (amort && typeof amort === "object" && Number(amort.months) > 1) {
    const totalMonths = Number(amort.months);
    const monthlyAmt =
      Number(amort.monthly_amount) ||
      Math.round(Number(transaction.amount || 0) / totalMonths);
    lines.push(
      ``,
      `🗓 <b>Амортизація на ${totalMonths} міс</b> (по <b>~${monthlyAmt.toLocaleString("uk-UA")} ₴/міс</b>)`,
      `💡 <i>З балансу списано всю суму. ШІ та аналітика зафіксують це як планову інвестицію на ${totalMonths} міс, а не разове марнотратство.</i>`
    );
  }

  if (isExpense && !isEmergency) {
    if (roundupResult?.roundupAmount) {
      lines.push(
        `🐷 Подушка: +<b>${Number(roundupResult.roundupAmount).toFixed(2)} ₴</b>`
      );
    }

    if (dailyBudget) {
      if (dailyBudget.todayRemaining > 0) {
        lines.push(
          `🎯 На день залишилось: <b>${dailyBudget.todayRemaining.toLocaleString("uk-UA").replace(/\u00A0/g, " ")} ₴</b>`
        );
      } else if (dailyBudget.todayRemaining === 0) {
        lines.push(`⚠️ <b>Денний бюджет на сьогодні вичерпано!</b>`);
      } else {
        const over = Math.abs(dailyBudget.todayRemaining)
          .toLocaleString("uk-UA")
          .replace(/\u00A0/g, " ");
        lines.push(`⚠️ <b>Переліміт за сьогодні: -${over} ₴</b>`);
      }
    }
  }

  const buttons: TelegramInlineKeyboardButton[][] = [
    [
      {
        text: "🏷 Змінити категорію",
        callback_data: `tg_cat:${transaction.id}`,
      },
      {
        text: "❌ Скасувати",
        callback_data: `tg_cancel:${transaction.id}`,
      },
    ],
  ];

  if (itemsCount && itemsCount > 1) {
    buttons.push([
      {
        text: `✂️ Split (${itemsCount})`,
        callback_data: `tg_split:${transaction.id}`,
      },
    ]);
  }

  return {
    text: lines.join("\n"),
    replyMarkup: { inline_keyboard: buttons },
  };
}

/**
 * Форматує відповідь на запит про зважений календарний темп
 */
export function formatPaceResponse(
  pacing: WeightedPacingResult,
  now: Date = new Date()
): string {
  const dayOfWeek = getKyivDayOfWeek(now);
  const isWeekend = isWeekendOrLeisureDay(dayOfWeek);
  const dayNames = [
    "Неділя",
    "Понеділок",
    "Вівторок",
    "Середа",
    "Четвер",
    "П'ятниця",
    "Субота",
  ];
  const dayName = dayNames[dayOfWeek] || "Сьогодні";

  const todayAllowance = isWeekend
    ? pacing.pacing.safeWeekendSpend
    : pacing.pacing.safeWeekdaySpend;

  const lines = [
    `🗓 <b>Сьогодні ${dayName} (${isWeekend ? "вихідний/дозвілля" : "робочий день"})</b>`,
    ``,
    `💰 <b>Безпечно на день:</b> <code>${todayAllowance.toLocaleString("uk-UA")} ₴</code> (лінійний: ~${pacing.pacing.flatDailySpend.toLocaleString("uk-UA")} ₴/д)`,
    `💼 <b>Будні (Пн–Чт):</b> ${pacing.pacing.safeWeekdaySpend.toLocaleString("uk-UA")} ₴/день`,
    `🍻 <b>Вікенд-буфер (Пт–Нд):</b> ~${pacing.pacing.safeWeekendSpend.toLocaleString("uk-UA")} ₴/день`,
    ``,
    `🔒 <b>Зарезервовано під підписки:</b> ${pacing.budget.reservedObligationsTotal.toLocaleString("uk-UA")} ₴`,
    `📊 <b>Вільний залишок:</b> ${pacing.budget.discretionaryRemaining.toLocaleString("uk-UA")} ₴ (залишилось ${pacing.cycle.daysRemaining} дн.)`,
  ];

  if (pacing.surplusProjection.projectedSurplusAmount > 0) {
    lines.push(
      ``,
      `🎯 <b>Очікуваний профіцит на кінець циклу:</b> +${pacing.surplusProjection.projectedSurplusAmount.toLocaleString("uk-UA")} ₴ (${pacing.surplusProjection.savingsPotentialPercent}% бюджету)`
    );
  } else if ((pacing.surplusProjection.projectedDeficitAmount || 0) > 100) {
    lines.push(
      ``,
      `⚠️ <b>Ризик дефіциту на кінець циклу:</b> -${(pacing.surplusProjection.projectedDeficitAmount || 0).toLocaleString("uk-UA")} ₴`
    );
  }

  lines.push(``, `💡 <i>${escapeHtml(pacing.pacing.advice)}</i>`);

  return lines.join("\n");
}

/**
 * Форматує результат симуляції покупки What-If
 */
export function formatWhatIfResponse(sim: PurchaseSimulationResult): string {
  const lines = [
    `${sim.verdictTitle}`,
    ``,
    sim.adviceHtml,
    ``,
    `📉 <b>Вплив на щоденний ліміт:</b>`,
    `• Будні: ${sim.currentSafeWeekday} ₴ ➔ <b>${sim.newSafeWeekday} ₴/день</b> (-${sim.weekdayDropPercent}%)`,
    `• Вихідні: ${sim.currentSafeWeekend} ₴ ➔ <b>${sim.newSafeWeekend} ₴/день</b> (-${sim.weekendDropPercent}%)`,
    `• Вільний залишок після покупки: <b>${sim.newDiscretionary.toLocaleString("uk-UA")} ₴</b>`,
  ];

  return lines.join("\n");
}
