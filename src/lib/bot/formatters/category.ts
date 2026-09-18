import { CATEGORIES, CategoryType } from "@/constants/categories";
import {
  TelegramReplyMarkup,
  TelegramInlineKeyboardButton,
} from "@/lib/telegram";
import { getCategoryEmoji } from "./emojis";

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
