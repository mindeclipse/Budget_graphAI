import {
  Transaction,
  SavingsGoal,
  InvestmentAsset,
  BudgetCycle,
  RecurringItem,
  WishlistItem,
  CostPerUseItem,
} from "@/types/finance";
import { SubscriptionRadarResult } from "@/lib/subscription-radar/types";

export function getDemoData() {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const day = today.getDate();

  // Зарплатний цикл: розпочався 14 днів тому, триватиме ще 16 днів
  const cycleStart = new Date(today);
  cycleStart.setDate(today.getDate() - 14);
  const cycleEnd = new Date(today);
  cycleEnd.setDate(today.getDate() + 16);

  const startIso = cycleStart.toISOString().split("T")[0];
  const endIso = cycleEnd.toISOString().split("T")[0];

  const activeCycle: BudgetCycle = {
    id: "demo-cycle-2026",
    name: `Зарплатний цикл (${cycleStart.toLocaleDateString("uk-UA", { day: "numeric", month: "short" })} – ${cycleEnd.toLocaleDateString("uk-UA", { day: "numeric", month: "short" })})`,
    start_date: startIso,
    end_date: endIso,
    budget_limit: 65000,
    is_active: true,
  };

  const cycles: BudgetCycle[] = [
    activeCycle,
    {
      id: "demo-cycle-prev",
      name: "Попередній зарплатний цикл",
      start_date: new Date(year, month - 1, 1).toISOString().split("T")[0],
      end_date: new Date(year, month - 1, 30).toISOString().split("T")[0],
      budget_limit: 60000,
      is_active: false,
    },
  ];

  // Генерація реалістичних транзакцій за останні 14 днів
  const txDefs = [
    {
      offsetDays: 0,
      amount: 840.5,
      category: "Продукти",
      merchant: "Сільпо (ТРЦ Gulliver)",
      source: "Apple Pay",
    },
    {
      offsetDays: 0,
      amount: 160.0,
      category: "Кафе та ресторани",
      merchant: "Idealist Coffee",
      source: "Apple Pay",
    },
    {
      offsetDays: 1,
      amount: 2150.0,
      category: "Транспорт",
      merchant: "WOG (Пальне А-95)",
      source: "Monobank",
    },
    {
      offsetDays: 1,
      amount: 320.0,
      category: "Продукти",
      merchant: "Аптека Доброго Дня",
      source: "Apple Pay",
    },
    {
      offsetDays: 2,
      amount: 1450.0,
      category: "Продукти",
      merchant: "Novus",
      source: "Apple Pay",
    },
    {
      offsetDays: 2,
      amount: 480.0,
      category: "Кафе та ресторани",
      merchant: "Mimosa Brooklyn Pizza",
      source: "Apple Pay",
    },
    {
      offsetDays: 3,
      amount: 890.0,
      category: "Транспорт",
      merchant: "Укрзалізниця (Інтерсіті)",
      source: "Monobank",
      tags: ["trip", "weekend"],
    },
    {
      offsetDays: 4,
      amount: 650.0,
      category: "Розваги",
      merchant: "Планета Кіно (IMAX)",
      source: "Apple Pay",
    },
    {
      offsetDays: 5,
      amount: 1780.0,
      category: "Розваги",
      merchant: "Zara Man",
      source: "Apple Pay",
    },
    {
      offsetDays: 5,
      amount: 560.0,
      category: "Продукти",
      merchant: "Сільпо",
      source: "Apple Pay",
    },
    {
      offsetDays: 6,
      amount: 350.0,
      category: "Підписки",
      merchant: "Kyivstar Тариф",
      source: "Apple Pay",
    },
    {
      offsetDays: 7,
      amount: 1250.0,
      category: "Продукти",
      merchant: "Сільпо",
      source: "Apple Pay",
    },
    {
      offsetDays: 7,
      amount: 420.0,
      category: "Кафе та ресторани",
      merchant: "Veterano Pizza",
      source: "Apple Pay",
    },
    {
      offsetDays: 8,
      amount: 2400.0,
      category: "Розваги",
      merchant: "Добробут (Консультація)",
      source: "Monobank",
    },
    {
      offsetDays: 9,
      amount: 1950.0,
      category: "Транспорт",
      merchant: "OKKO (Пальне)",
      source: "Monobank",
    },
    {
      offsetDays: 10,
      amount: 980.0,
      category: "Продукти",
      merchant: "Le Silpo",
      source: "Apple Pay",
    },
    {
      offsetDays: 11,
      amount: 149.0,
      category: "Підписки",
      merchant: "YouTube Premium",
      source: "Recurring",
    },
    {
      offsetDays: 11,
      amount: 289.0,
      category: "Підписки",
      merchant: "Spotify Family",
      source: "Recurring",
    },
    {
      offsetDays: 12,
      amount: 499.0,
      category: "Підписки",
      merchant: "Netflix Ultra HD",
      source: "Recurring",
    },
    {
      offsetDays: 12,
      amount: 1850.0,
      category: "Продукти",
      merchant: "Сільпо",
      source: "Apple Pay",
    },
    {
      offsetDays: 13,
      amount: 620.0,
      category: "Кафе та ресторани",
      merchant: "Кафе Маяк",
      source: "Apple Pay",
    },
    {
      offsetDays: 14,
      amount: 3500.0,
      category: "Підписки",
      merchant: "Комунальні послуги ГІОЦ",
      source: "Monobank",
    },
  ];

  const transactions: Transaction[] = txDefs.map((def, idx) => {
    const txDate = new Date(today);
    txDate.setDate(today.getDate() - def.offsetDays);
    txDate.setHours(12 + (idx % 8), (idx * 17) % 60, 0);

    return {
      id: 90000 + idx,
      amount: def.amount,
      currency: "UAH",
      category_name: def.category,
      merchant_raw: def.merchant,
      source: def.source,
      type: "expense",
      created_at: txDate.toISOString(),
      tags: def.tags || [],
    };
  });

  // Додаємо спліт-транзакцію для демонстрації
  const splitParentDate = new Date(today);
  splitParentDate.setDate(today.getDate() - 3);
  transactions.push(
    {
      id: 90098,
      amount: 1200.0,
      currency: "UAH",
      category_name: "Продукти",
      merchant_raw: "Епіцентр К (Спліт чека)",
      source: "Apple Pay",
      type: "expense",
      created_at: splitParentDate.toISOString(),
      tags: ["split", "home"],
    },
    {
      id: 90099,
      amount: 650.0,
      currency: "UAH",
      category_name: "Розваги",
      merchant_raw: "Епіцентр К (Інструменти)",
      source: "Apple Pay",
      type: "expense",
      created_at: splitParentDate.toISOString(),
      tags: ["split"],
    }
  );

  const categoryBudgets: Record<string, number> = {
    Продукти: 14000,
    Розваги: 7000,
    Транспорт: 6500,
    Підписки: 6000,
    "Кафе та ресторани": 4500,
  };

  const savingsGoals: SavingsGoal[] = [
    {
      id: 901,
      name: "🛡️ Подушка безпеки (Runway 6 міс)",
      target_amount: 240000,
      current_amount: 186500,
      currency: "UAH",
      target_date: new Date(year, 11, 31).toISOString(),
      created_at: new Date(year, 0, 1).toISOString(),
    },
    {
      id: 902,
      name: "🇳🇴 Подорож до норвезьких фіордів",
      target_amount: 65000,
      current_amount: 42000,
      currency: "UAH",
      target_date: new Date(year, 7, 15).toISOString(),
      created_at: new Date(year, 1, 1).toISOString(),
    },
    {
      id: 903,
      name: "💻 Оновлення робочого сетапу (M4)",
      target_amount: 85000,
      current_amount: 54000,
      currency: "UAH",
      target_date: new Date(year, 9, 30).toISOString(),
      created_at: new Date(year, 2, 1).toISOString(),
    },
  ];

  const investments: InvestmentAsset[] = [
    {
      id: 910,
      asset_name: "ОВДП UA4000... (Військові облігації)",
      asset_type: "bonds",
      invested_amount: 60000,
      current_value: 65400,
      currency: "UAH",
      yield_percent: 16.5,
      maturity_date: "2027-03-24",
      notes: "Купонна дохідність без оподаткування ПДФО",
      created_at: new Date(year, 0, 15).toISOString(),
    },
    {
      id: 911,
      asset_name: "Inzhur REIT (Фонд 1000 / Епіцентр)",
      asset_type: "reit",
      invested_amount: 125000,
      current_value: 139200,
      currency: "UAH",
      yield_percent: 11.4,
      notes: "Щомісячні дивіденди від комерційної оренди",
      created_at: new Date(year, 1, 10).toISOString(),
    },
    {
      id: 912,
      asset_name: "Готівковий резервний фонд ($)",
      asset_type: "other",
      invested_amount: 88000,
      current_value: 88000,
      currency: "USD",
      yield_percent: 0,
      notes: "$2,000 резерв ліквідності у валюті",
      created_at: new Date(year, 0, 1).toISOString(),
    },
    {
      id: 913,
      asset_name: "Bitcoin (Cold Storage)",
      asset_type: "crypto",
      invested_amount: 48000,
      current_value: 76500,
      currency: "UAH",
      yield_percent: 59.3,
      notes: "0.025 BTC довгостроковий HODL",
      created_at: new Date(year - 1, 5, 20).toISOString(),
    },
  ];

  const recurring: RecurringItem[] = [
    {
      id: 920,
      title: "Netflix Ultra HD",
      amount: 499,
      currency: "UAH",
      category_name: "Підписки",
      day_of_month: 12,
      is_active: true,
    },
    {
      id: 921,
      title: "Spotify Family",
      amount: 289,
      currency: "UAH",
      category_name: "Підписки",
      day_of_month: 11,
      is_active: true,
    },
    {
      id: 922,
      title: "YouTube Premium",
      amount: 149,
      currency: "UAH",
      category_name: "Підписки",
      day_of_month: 11,
      is_active: true,
    },
    {
      id: 923,
      title: "iCloud+ 2TB",
      amount: 399,
      currency: "UAH",
      category_name: "Підписки",
      day_of_month: 18,
      is_active: true,
    },
    {
      id: 924,
      title: "ChatGPT Plus (OpenAI)",
      amount: 880,
      currency: "UAH",
      category_name: "Підписки",
      day_of_month: 25,
      is_active: true,
    },
  ];

  const radarData: SubscriptionRadarResult = {
    detected: [
      {
        id: "netflix-499-uah",
        title: "Netflix Ultra HD",
        amount: 499,
        currency: "UAH",
        category_name: "Підписки",
        predicted_day_of_month: 12,
        confidence: "high",
        interval_days: 30,
        occurrences_count: 4,
        last_billed_at: new Date(year, month, 12).toISOString(),
      },
      {
        id: "spotify-289-uah",
        title: "Spotify Family",
        amount: 289,
        currency: "UAH",
        category_name: "Підписки",
        predicted_day_of_month: 11,
        confidence: "high",
        interval_days: 30,
        occurrences_count: 5,
        last_billed_at: new Date(year, month, 11).toISOString(),
      },
      {
        id: "kyivstar-350-uah",
        title: "Kyivstar Тариф",
        amount: 350,
        currency: "UAH",
        category_name: "Комунікації",
        predicted_day_of_month: 6,
        confidence: "medium",
        interval_days: 28,
        occurrences_count: 3,
        last_billed_at: new Date(year, month, 6).toISOString(),
      },
    ],
    upcoming: [
      {
        id: 920,
        title: "Netflix Ultra HD",
        amount: 499,
        currency: "UAH",
        category_name: "Підписки",
        day_of_month: 12,
        status: "paid",
        days_remaining: 0,
        paid_at: new Date(year, month, 12).toISOString(),
        paid_amount: 499,
      },
      {
        id: 921,
        title: "Spotify Family",
        amount: 289,
        currency: "UAH",
        category_name: "Підписки",
        day_of_month: 11,
        status: "paid",
        days_remaining: 0,
        paid_at: new Date(year, month, 11).toISOString(),
        paid_amount: 289,
      },
      {
        id: 924,
        title: "ChatGPT Plus (OpenAI)",
        amount: 880,
        currency: "UAH",
        category_name: "Підписки",
        day_of_month: 25,
        status: "upcoming",
        days_remaining: 5,
      },
    ],
    metrics: {
      monthly_total: 2216,
      annual_total: 26592,
      paid_this_month: 937,
      remaining_this_month: 1279,
      detected_count: 3,
    },
  };

  const costPerUseItems: CostPerUseItem[] = [
    {
      id: 930,
      item_name: 'MacBook Pro 16" (M3 Max)',
      category_name: "Техніка",
      purchase_price: 98000,
      currency: "UAH",
      purchase_date: new Date(year - 1, 8, 1).toISOString(),
      total_uses: 265,
      benchmark_cost_per_use: 300,
      notes: "Щоденний робочий інструмент розробки",
      created_at: new Date(year - 1, 8, 1).toISOString(),
    },
    {
      id: 931,
      item_name: "Кавоварка DeLonghi Magnifica",
      category_name: "Дім та побут",
      purchase_price: 18500,
      currency: "UAH",
      purchase_date: new Date(year - 1, 4, 15).toISOString(),
      total_uses: 480,
      benchmark_cost_per_use: 40,
      notes: "480 порцій домашньої кави (економія vs кав'ярні)",
      created_at: new Date(year - 1, 4, 15).toISOString(),
    },
    {
      id: 932,
      item_name: "Кросівки Asics Novablast 4",
      category_name: "Спорт",
      purchase_price: 4900,
      currency: "UAH",
      purchase_date: new Date(year, 1, 20).toISOString(),
      total_uses: 68,
      benchmark_cost_per_use: 70,
      notes: "68 бігових тренувань (72 ₴ за тренування)",
      created_at: new Date(year, 1, 20).toISOString(),
    },
  ];

  const wishlistItems: WishlistItem[] = [
    {
      id: 940,
      title: "Навушники Sony WH-1000XM5",
      estimated_price: 14990,
      currency: "UAH",
      category_name: "Техніка",
      cooling_days: 14,
      cooling_end_date: new Date(today.getTime() + 6 * 86400000).toISOString(),
      status: "cooling",
      notes: "Шумозаглушення для фокусної роботи в коворкінгу",
      created_at: new Date(today.getTime() - 8 * 86400000).toISOString(),
    },
    {
      id: 941,
      title: "Ергономічне крісло Herman Miller Aeron",
      estimated_price: 48000,
      currency: "UAH",
      category_name: "Дім та побут",
      cooling_days: 30,
      cooling_end_date: new Date(today.getTime() - 2 * 86400000).toISOString(),
      status: "ready",
      notes: "Таймер охолодження завершився, потреба залишається актуальною",
      created_at: new Date(today.getTime() - 32 * 86400000).toISOString(),
    },
    {
      id: 942,
      title: "Дрон DJI Mini 4 Pro",
      estimated_price: 36000,
      currency: "UAH",
      category_name: "Розваги",
      cooling_days: 21,
      cooling_end_date: new Date(today.getTime() - 5 * 86400000).toISOString(),
      status: "saved",
      notes:
        "Імпульсивне бажання минуло після охолодження. Зекономлено 36 000 ₴!",
      resolved_at: new Date(today.getTime() - 4 * 86400000).toISOString(),
      created_at: new Date(today.getTime() - 26 * 86400000).toISOString(),
    },
  ];

  return {
    activeCycle,
    cycles,
    transactions,
    categoryBudgets,
    savingsGoals,
    investments,
    recurring,
    radarData,
    costPerUseItems,
    costPerUseSavedAmount: 38400,
    wishlistItems,
    wishlistSavedAmount: 36000,
    commercialRates: { USD: 44.0, EUR: 48.0, PLN: 11.0 },
  };
}
