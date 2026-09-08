import {
  ShoppingCart,
  Utensils,
  Car,
  Fuel,
  Shirt,
  HeartPulse,
  Home,
  Flame,
  GraduationCap,
  Sparkles,
  Package,
  TrendingUp,
  Briefcase,
  HelpCircle,
  Cigarette,
  LucideIcon,
} from "lucide-react";

export const CATEGORIES = [
  "Продукти",
  "Кафе та ресторани",
  "Куріння",
  "Транспорт",
  "Авто",
  "Одяг та взуття",
  "Здоров'я",
  "Оренда та комуналка",
  "Підписки та сервіси",
  "Освіта та книги",
  "Розваги та хобі",
  "Покупки",
  "Інвестиції",
  "Зарплата/ФОП",
  "Інше",
] as const;

export type CategoryType = (typeof CATEGORIES)[number];

export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  Продукти: ShoppingCart,
  "Кафе та ресторани": Utensils,
  Куріння: Cigarette,
  Транспорт: Car,
  Авто: Fuel,
  "Одяг та взуття": Shirt,
  "Здоров'я": HeartPulse,
  "Оренда та комуналка": Home,
  "Підписки та сервіси": Flame,
  "Освіта та книги": GraduationCap,
  "Розваги та хобі": Sparkles,
  Покупки: Package,
  Інвестиції: TrendingUp,
  "Зарплата/ФОП": Briefcase,
  Інше: HelpCircle,
};

export const CATEGORY_COLORS: Record<string, string> = {
  Продукти: "#10B981", // Смарагдовий
  "Кафе та ресторани": "#F59E0B", // Бурштиновий
  Куріння: "#EF4444", // Червоний
  Транспорт: "#3B82F6", // Синій
  Авто: "#F97316", // Помаранчевий
  "Одяг та взуття": "#EC4899", // Рожевий
  "Здоров'я": "#14B8A6", // Бірюзовий
  "Оренда та комуналка": "#6366F1", // Індиго
  "Підписки та сервіси": "#8B5CF6", // Фіолетовий
  "Освіта та книги": "#A855F7", // Пурпурний
  "Розваги та хобі": "#F43F5E", // Рожево-червоний
  Покупки: "#06B6D4", // Циан
  Інвестиції: "#22C55E", // Зелений
  "Зарплата/ФОП": "#34D399", // М'ятний
  Інше: "#71717A", // Сірий
};
