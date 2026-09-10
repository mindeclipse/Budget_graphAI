import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { sendTelegramDocument } from "@/lib/telegram";

export interface BackupPayload {
  version: string;
  timestamp: string;
  app: string;
  data: {
    transactions: any[];
    budget_cycles: any[];
    recurring_templates: any[];
    merchant_rules: any[];
    savings_goals: any[];
    investments: any[];
    category_budgets: any[];
    wishlist_items: any[];
    cost_per_use_items: any[];
  };
  counts: {
    transactions: number;
    budget_cycles: number;
    recurring_templates: number;
    merchant_rules: number;
    savings_goals: number;
    investments: number;
    category_budgets: number;
    wishlist_items: number;
    cost_per_use_items: number;
  };
}

/**
 * Вибірка всіх рядків з таблиці Supabase з автоматичною пагінацією
 * для обходу системного ліміту PostgREST у 1000 рядків.
 */
export async function fetchAllRowsFromTable<T = any>(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  tableName: string,
  orderColumn = "id",
  ascending = true
): Promise<T[]> {
  const PAGE_SIZE = 1000;
  const allRows: T[] = [];
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from(tableName)
      .select("*")
      .order(orderColumn, { ascending })
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      console.error(
        `[fetchAllRowsFromTable] Помилка завантаження з ${tableName}:`,
        error
      );
      throw error;
    }

    if (!data || data.length === 0) {
      hasMore = false;
    } else {
      allRows.push(...(data as T[]));
      if (data.length < PAGE_SIZE) {
        hasMore = false;
      } else {
        from += PAGE_SIZE;
      }
    }
  }

  return allRows;
}

/**
 * Генерує повний об'єкт бекапу з усіх таблиць бази даних Supabase
 */
export async function generateBackupData(): Promise<BackupPayload> {
  const supabase = getSupabaseAdmin();

  const [
    transactions,
    budget_cycles,
    recurring_templates,
    merchant_rules,
    savings_goals,
    investments,
    category_budgets,
    wishlist_items,
    cost_per_use_items,
  ] = await Promise.all([
    fetchAllRowsFromTable(supabase, "transactions", "id", true),
    fetchAllRowsFromTable(supabase, "budget_cycles", "start_date", true),
    fetchAllRowsFromTable(supabase, "recurring_templates", "id", true),
    fetchAllRowsFromTable(supabase, "merchant_rules", "id", true),
    fetchAllRowsFromTable(supabase, "savings_goals", "id", true),
    fetchAllRowsFromTable(supabase, "investments", "id", true),
    fetchAllRowsFromTable(supabase, "category_budgets", "id", true),
    fetchAllRowsFromTable(supabase, "wishlist_items", "id", true),
    fetchAllRowsFromTable(supabase, "cost_per_use_items", "id", true),
  ]);

  const backupPayload: BackupPayload = {
    version: "1.0",
    timestamp: new Date().toISOString(),
    app: "BudgetGraph AI",
    data: {
      transactions,
      budget_cycles,
      recurring_templates,
      merchant_rules,
      savings_goals,
      investments,
      category_budgets,
      wishlist_items,
      cost_per_use_items,
    },
    counts: {
      transactions: transactions.length,
      budget_cycles: budget_cycles.length,
      recurring_templates: recurring_templates.length,
      merchant_rules: merchant_rules.length,
      savings_goals: savings_goals.length,
      investments: investments.length,
      category_budgets: category_budgets.length,
      wishlist_items: wishlist_items.length,
      cost_per_use_items: cost_per_use_items.length,
    },
  };

  return backupPayload;
}

/**
 * Генерує бекап та надсилає його файлом JSON у Telegram
 */
export async function sendBackupToTelegram(customCaption?: string): Promise<{
  success: boolean;
  error?: string;
  fileName?: string;
}> {
  try {
    const backup = await generateBackupData();
    const dateStr = new Date().toISOString().slice(0, 10);
    const fileName = `budgetgraph-backup-${dateStr}.json`;
    const jsonContent = JSON.stringify(backup, null, 2);

    const kyivFormattedDate = new Intl.DateTimeFormat("uk-UA", {
      timeZone: "Europe/Kyiv",
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date());

    const caption =
      customCaption ||
      [
        `📦 <b>Резервна копія даних (Автобекап)</b>`,
        `🗓 <i>${kyivFormattedDate}</i>`,
        ``,
        `📊 <b>Вміст бекапу:</b>`,
        `• Транзакцій: <b>${backup.counts.transactions}</b>`,
        `• Правил мерчантів: <b>${backup.counts.merchant_rules}</b>`,
        `• Регулярних витрат: <b>${backup.counts.recurring_templates}</b>`,
        `• Цілей накопичення: <b>${backup.counts.savings_goals}</b>`,
        `• Інвестицій: <b>${backup.counts.investments}</b>`,
        `• Списку бажань: <b>${backup.counts.wishlist_items}</b>`,
        `• Речей (Cost per use): <b>${backup.counts.cost_per_use_items}</b>`,
        ``,
        `ℹ️ <i>Файл придатний для миттєвого відновлення через додаток у розділі Налаштування.</i>`,
      ].join("\n");

    const sent = await sendTelegramDocument(jsonContent, fileName, caption);
    if (!sent) {
      return {
        success: false,
        error: "Помилка відправки документа в Telegram",
      };
    }

    return { success: true, fileName };
  } catch (err: any) {
    console.error("[sendBackupToTelegram error]:", err);
    return {
      success: false,
      error: err?.message || "Не вдалося сформувати бекап",
    };
  }
}
