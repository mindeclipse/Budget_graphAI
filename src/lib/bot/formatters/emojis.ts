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

export function getCategoryEmoji(category: string): string {
  return (CATEGORY_EMOJIS as Record<string, string>)[category] || "📦";
}
