/**
 * Utility functions for automatic spare change roundups (PrivatBank / Privat24 style).
 * - "Від витрат": rounding up expenses to the nearest 10 UAH and saving the change to "Фінансова подушка".
 * - "Округлення залишку / балансу": rounding down the card balance to 10 UAH and sweeping change to "Фінансова подушка".
 */

export const ROUNDUP_DEFAULT_STEP = 10;
export const ROUNDUP_GOAL_NAME = "Фінансова подушка";
export const ROUNDUP_CATEGORY_NAME = "Внутрішні перекази / Подушка";
export const ROUNDUP_EXPENSE_MERCHANT_PREFIX =
  "Решта від округлення витрат на ";
export const ROUNDUP_BALANCE_MERCHANT_PREFIX = "Округлення залишку на ";

/**
 * Розраховує решту від витрат до найближчого кратного step (за замовчуванням 10 ₴).
 * Наприклад:
 *   66.60 ₴ -> 3.40 ₴ (до 70.00 ₴)
 *   17.00 ₴ -> 3.00 ₴ (до 20.00 ₴)
 *   29.99 ₴ -> 0.01 ₴ (до 30.00 ₴)
 *   42.00 ₴ -> 8.00 ₴ (до 50.00 ₴)
 *   35 758.74 ₴ -> 1.26 ₴ (до 35 760.00 ₴)
 *   180.00 ₴ -> 0.00 ₴ (вже кратне 10)
 */
export function calculateExpenseRoundup(
  amount: number,
  step = ROUNDUP_DEFAULT_STEP
): number {
  if (typeof amount !== "number" || isNaN(amount) || amount <= 0) return 0;
  if (typeof step !== "number" || isNaN(step) || step <= 0) return 0;

  const remainder = Math.ceil(amount / step) * step - amount;
  const rounded = Math.round(remainder * 100) / 100;
  return rounded > 0.0001 ? rounded : 0;
}

/**
 * Розраховує суму округлення залишку / балансу картки до кратного step (за замовчуванням 10 ₴).
 * Наприклад:
 *   57 994.93 ₴ -> 4.93 ₴ (баланс стане 57 990.00 ₴)
 *   57 990.00 ₴ -> 0.00 ₴ (вже кругле)
 */
export function calculateBalanceRounddown(
  balance: number,
  step = ROUNDUP_DEFAULT_STEP
): number {
  if (typeof balance !== "number" || isNaN(balance) || balance <= 0) return 0;
  if (typeof step !== "number" || isNaN(step) || step <= 0) return 0;

  const remainder = balance - Math.floor(balance / step) * step;
  const rounded = Math.round(remainder * 100) / 100;
  return rounded > 0.0001 ? rounded : 0;
}

/**
 * Перевіряє, чи є транзакція операцією автоокруглення / поповнення фінансової подушки.
 */
export function isRoundupTransaction(
  merchantRaw?: string | null,
  categoryName?: string | null
): boolean {
  const text = `${merchantRaw || ""} ${categoryName || ""}`.toLowerCase();
  return (
    text.includes("подушка") ||
    text.includes("подушк") ||
    text.includes("решта від округлення") ||
    text.includes("округлення залишку") ||
    text.includes("округлення витрат")
  );
}

export interface ProcessRoundupOptions {
  parentTxId?: number | null;
  amount: number;
  currency: string;
  source: string;
  goalName?: string;
  customStep?: number;
}

export interface ProcessRoundupResult {
  roundupAmount: number;
  roundupTxId?: number;
  goalName: string;
  goalUpdated: boolean;
  newGoalBalance?: number;
}

/**
 * Виконує автоматичне створення транзакції решти та оновлення скарбнички в базі даних.
 */
export async function processExpenseRoundup(
  supabaseAdmin: any,
  options: ProcessRoundupOptions
): Promise<ProcessRoundupResult | null> {
  const {
    parentTxId,
    amount,
    currency,
    source,
    goalName = ROUNDUP_GOAL_NAME,
    customStep = ROUNDUP_DEFAULT_STEP,
  } = options;

  if (currency !== "UAH" || amount <= 0) {
    return null;
  }

  const roundupAmount = calculateExpenseRoundup(amount, customStep);
  if (roundupAmount <= 0) {
    return null;
  }

  const merchantRaw = `${ROUNDUP_EXPENSE_MERCHANT_PREFIX}${goalName}`;
  const createdAt = new Date(Date.now() + 1000).toISOString();

  // 1. Створюємо супутню транзакцію переказу типу 'transfer'
  const { data: insertedTx, error: txError } = await supabaseAdmin
    .from("transactions")
    .insert({
      amount: roundupAmount,
      currency: "UAH",
      merchant_raw: merchantRaw,
      category_name: ROUNDUP_CATEGORY_NAME,
      source,
      type: "transfer",
      created_at: createdAt,
      exclude_from_budget: false,
      parent_transaction_id: parentTxId ?? null,
    })
    .select("id")
    .single();

  if (txError) {
    console.error(
      "[processExpenseRoundup] Помилка створення транзакції решти:",
      txError
    );
    return null;
  }

  // 2. Оновлюємо або створюємо скарбничку у таблиці savings_goals
  let goalUpdated = false;
  let newGoalBalance: number | undefined;

  try {
    const { data: existingGoal } = await supabaseAdmin
      .from("savings_goals")
      .select("id, current_amount")
      .ilike("name", `%${goalName}%`)
      .maybeSingle();

    if (existingGoal) {
      const current = Number(existingGoal.current_amount || 0);
      newGoalBalance = Math.round((current + roundupAmount) * 100) / 100;

      const { error: updateGoalErr } = await supabaseAdmin
        .from("savings_goals")
        .update({ current_amount: newGoalBalance })
        .eq("id", existingGoal.id);

      if (!updateGoalErr) {
        goalUpdated = true;
      } else {
        console.error(
          "[processExpenseRoundup] Помилка оновлення цілі:",
          updateGoalErr
        );
      }
    } else {
      newGoalBalance = roundupAmount;
      const { error: createGoalErr } = await supabaseAdmin
        .from("savings_goals")
        .insert({
          name: goalName,
          current_amount: roundupAmount,
          currency: "UAH",
          target_amount: null,
        });

      if (!createGoalErr) {
        goalUpdated = true;
      } else {
        console.error(
          "[processExpenseRoundup] Помилка створення цілі:",
          createGoalErr
        );
      }
    }
  } catch (goalErr) {
    console.error(
      "[processExpenseRoundup] Помилка роботи зі скарбничкою:",
      goalErr
    );
  }

  return {
    roundupAmount,
    roundupTxId: insertedTx?.id,
    goalName,
    goalUpdated,
    newGoalBalance,
  };
}
