import { TelegramReplyMarkup } from "@/lib/telegram";
import { generateBudgetDashboardImage } from "@/lib/dashboard-image";
import { ROUNDUP_GOAL_NAME } from "@/lib/roundup-utils";
import { isWeekendOrLeisureDay } from "@/lib/weighted-pacing";
import { getKyivDayOfWeek } from "@/lib/behavioral-metrics";
import { loadCyclePacing } from "./loader";

/**
 * Обробник запиту на генерацію графічної картки / дашборду бюджету
 */
export async function handleTelegramChartCommand(
  supabaseAdmin: any,
  now: Date = new Date()
): Promise<{
  photoBuffer: Buffer;
  caption: string;
  replyMarkup: TelegramReplyMarkup;
}> {
  const { pacing } = await loadCyclePacing(supabaseAdmin, now);

  const { data: goals } = await supabaseAdmin
    .from("savings_goals")
    .select("id, name, current_amount")
    .order("id", { ascending: true });

  const cushionGoal = (goals || []).find(
    (g: any) =>
      g.name?.toLowerCase().includes("подушка") ||
      g.name?.toLowerCase() === ROUNDUP_GOAL_NAME.toLowerCase()
  );
  const cushionCurrent = Number(cushionGoal?.current_amount || 0);

  const currentMonthStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    1
  ).toISOString();

  const { data: rawRoundupTxs } = await supabaseAdmin
    .from("transactions")
    .select("amount, created_at, merchant_raw, category_name, source")
    .gte("created_at", currentMonthStart)
    .or(
      "category_name.ilike.%подушка%,merchant_raw.ilike.%округлення%,source.eq.roundup"
    )
    .is("deleted_at", null);

  const monthRoundupTxs = (rawRoundupTxs || []).filter((t: any) => {
    const m = (t.merchant_raw || "").toLowerCase();
    return (
      m.includes("округлення") || m.includes("решта") || t.source === "roundup"
    );
  });

  const monthRoundupAmount =
    Math.round(
      monthRoundupTxs.reduce(
        (sum: number, t: any) => sum + Number(t.amount || 0),
        0
      ) * 100
    ) / 100;

  const photoBuffer = await generateBudgetDashboardImage(pacing, {
    cushionCurrent,
    monthRoundupAmount,
  });

  const statusEmojis: Record<string, string> = {
    healthy: "🟢",
    tight: "🟡",
    critical: "🟠",
    depleted: "🔴",
  };
  const statusEmoji = statusEmojis[pacing.pacing.status] || "ℹ️";

  const dayOfWeek = getKyivDayOfWeek(now);
  const isWeekend = isWeekendOrLeisureDay(dayOfWeek);
  const safeToday = isWeekend
    ? pacing.pacing.safeWeekendSpend
    : pacing.pacing.safeWeekdaySpend;

  const caption = [
    `📈 <b>Графічний дашборд бюджетного циклу</b>`,
    ``,
    `Статус: ${statusEmoji} <b>${pacing.pacing.statusLabel}</b>`,
    `Вільний залишок: <b>${pacing.budget.discretionaryRemaining.toLocaleString("uk-UA")} ₴</b>`,
    `Ліміт на сьогодні (${isWeekend ? "вихідні" : "будні"}): <b>~${safeToday.toLocaleString("uk-UA")} ₴</b>`,
  ].join("\n");

  const appUrl =
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://budget-pwa.vercel.app";

  const replyMarkup: TelegramReplyMarkup = {
    inline_keyboard: [
      [
        { text: "🔄 Оновити графік", callback_data: "tg_send_chart" },
        { text: "🎯 Мій темп", callback_data: "tg_refresh_pace" },
      ],
      [{ text: "📊 Відкрити BudgetGraph", url: appUrl }],
    ],
  };

  return { photoBuffer, caption, replyMarkup };
}
