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
 * Генерує повний об'єкт бекапу з усіх таблиць бази даних Supabase
 */
export async function generateBackupData(): Promise<BackupPayload> {
  const supabase = getSupabaseAdmin();

  const [
    txRes,
    cyclesRes,
    recurringRes,
    rulesRes,
    goalsRes,
    investRes,
    catBudgetsRes,
    wishlistRes,
    costPerUseRes,
  ] = await Promise.all([
    supabase.from("transactions").select("*").order("id", { ascending: true }),
    supabase
      .from("budget_cycles")
      .select("*")
      .order("start_date", { ascending: true }),
    supabase
      .from("recurring_templates")
      .select("*")
      .order("id", { ascending: true }),
    supabase.from("merchant_rules").select("*"),
    supabase.from("savings_goals").select("*").order("id", { ascending: true }),
    supabase.from("investments").select("*").order("id", { ascending: true }),
    supabase.from("category_budgets").select("*"),
    supabase
      .from("wishlist_items")
      .select("*")
      .order("id", { ascending: true }),
    supabase
      .from("cost_per_use_items")
      .select("*")
      .order("id", { ascending: true }),
  ]);

  const backupPayload: BackupPayload = {
    version: "1.0",
    timestamp: new Date().toISOString(),
    app: "BudgetGraph AI",
    data: {
      transactions: txRes.data || [],
      budget_cycles: cyclesRes.data || [],
      recurring_templates: recurringRes.data || [],
      merchant_rules: rulesRes.data || [],
      savings_goals: goalsRes.data || [],
      investments: investRes.data || [],
      category_budgets: catBudgetsRes.data || [],
      wishlist_items: wishlistRes.data || [],
      cost_per_use_items: costPerUseRes.data || [],
    },
    counts: {
      transactions: txRes.data?.length || 0,
      budget_cycles: cyclesRes.data?.length || 0,
      recurring_templates: recurringRes.data?.length || 0,
      merchant_rules: rulesRes.data?.length || 0,
      savings_goals: goalsRes.data?.length || 0,
      investments: investRes.data?.length || 0,
      category_budgets: catBudgetsRes.data?.length || 0,
      wishlist_items: wishlistRes.data?.length || 0,
      cost_per_use_items: costPerUseRes.data?.length || 0,
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
