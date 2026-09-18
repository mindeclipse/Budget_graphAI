import { escapeHtml } from "@/lib/security";
import { renderProgressBar } from "@/lib/bot/formatters";
import { ROUNDUP_GOAL_NAME } from "@/lib/roundup-utils";

/**
 * Обробник запиту про стан подушки безпеки та скарбнички автоокруглення
 */
export async function handleTelegramEmergencyFundCommand(
  supabaseAdmin: any,
  now: Date = new Date()
): Promise<string> {
  const { data: goals } = await supabaseAdmin
    .from("savings_goals")
    .select("id, name, target_amount, current_amount, currency")
    .order("id", { ascending: true });

  const cushionGoal = (goals || []).find(
    (g: any) =>
      g.name?.toLowerCase().includes("подушка") ||
      g.name?.toLowerCase() === ROUNDUP_GOAL_NAME.toLowerCase()
  );

  const otherGoals = (goals || []).filter((g: any) => g.id !== cushionGoal?.id);

  const { data: rawRoundupTxs } = await supabaseAdmin
    .from("transactions")
    .select("amount, created_at, merchant_raw, category_name, source")
    .or(
      "category_name.ilike.%подушка%,merchant_raw.ilike.%округлення%,source.eq.roundup"
    )
    .is("deleted_at", null);

  const roundupTxs: any[] = [];
  const directTransfers: any[] = [];

  for (const t of rawRoundupTxs || []) {
    const m = (t.merchant_raw || "").toLowerCase();
    if (
      m.includes("округлення") ||
      m.includes("решта") ||
      t.source === "roundup"
    ) {
      roundupTxs.push(t);
    } else {
      directTransfers.push(t);
    }
  }

  const totalRoundupAmount =
    Math.round(
      roundupTxs.reduce(
        (sum: number, t: any) => sum + Number(t.amount || 0),
        0
      ) * 100
    ) / 100;
  const totalRoundupsCount = roundupTxs.length;

  const directTransferTotal =
    Math.round(
      directTransfers.reduce(
        (sum: number, t: any) => sum + Number(t.amount || 0),
        0
      ) * 100
    ) / 100;
  const directTransfersCount = directTransfers.length;

  const currentMonthStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    1
  ).toISOString();

  const monthRoundupTxs = roundupTxs.filter(
    (t: any) => t.created_at && t.created_at >= currentMonthStart
  );
  const monthRoundupAmount =
    Math.round(
      monthRoundupTxs.reduce(
        (sum: number, t: any) => sum + Number(t.amount || 0),
        0
      ) * 100
    ) / 100;
  const monthRoundupCount = monthRoundupTxs.length;

  const cushionCurrent = Number(cushionGoal?.current_amount || 0);
  const cushionTarget = cushionGoal?.target_amount
    ? Number(cushionGoal.target_amount)
    : null;

  const lines = [
    `🛡️ <b>Фінансова подушка безпеки</b>`,
    ``,
    `🪙 <b>Скарбничка автоокруглення («${escapeHtml(cushionGoal?.name || ROUNDUP_GOAL_NAME)}»):</b>`,
    `• Доступний баланс: <b>${cushionCurrent.toLocaleString("uk-UA")} ₴</b>`,
  ];

  if (cushionTarget && cushionTarget > 0) {
    const progressPercent = Math.min(
      100,
      Math.round((cushionCurrent / cushionTarget) * 100)
    );
    lines.push(
      `• Ціль: <b>${cushionTarget.toLocaleString("uk-UA")} ₴</b> (${progressPercent}%)`,
      `<code>[${renderProgressBar(progressPercent)}]</code>`
    );
  }

  lines.push(
    `• Заощаджено рештою за цей місяць: <b>+${monthRoundupAmount.toLocaleString("uk-UA")} ₴</b> (${monthRoundupCount} оп.)`,
    `• Всього накопичено чистою рештою: <b>+${totalRoundupAmount.toLocaleString("uk-UA")} ₴</b> (${totalRoundupsCount} оп.)`
  );

  if (directTransfersCount > 0) {
    lines.push(
      `• Прямі поповнення подушки: <b>+${directTransferTotal.toLocaleString("uk-UA")} ₴</b> (${directTransfersCount} оп.)`
    );
  }

  if (otherGoals.length > 0) {
    lines.push(``, `💵 <b>Інші активи та резерви:</b>`);
    for (const g of otherGoals) {
      const currSymbol =
        g.currency === "USD"
          ? "$"
          : g.currency === "EUR"
            ? "€"
            : g.currency === "UAH"
              ? "₴"
              : g.currency;
      const amount = Number(g.current_amount || 0).toLocaleString("uk-UA");
      lines.push(`• ${escapeHtml(g.name)}: <b>${amount} ${currSymbol}</b>`);
    }
  }

  lines.push(
    ``,
    `💡 <i>Кожна безготівкова витрата округлюється до 10 ₴, непомітно формуючи вашу фінансову безпеку.</i>`
  );

  return lines.join("\n");
}
