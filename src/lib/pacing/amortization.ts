import { Transaction } from "@/types/finance";
import { UpcomingObligation } from "./types";

/**
 * Повертає ефективну суму витрати для розрахунку темпу (з урахуванням амортизації)
 */
export function getEffectiveTransactionExpense(tx: Transaction): number {
  if (tx.exclude_from_budget || tx.type !== "expense" || tx.deleted_at) {
    return 0;
  }
  const amt = Number(tx.amount || 0);
  if (isNaN(amt) || amt <= 0) return 0;

  // Реальний рух коштів (Cash Flow): вся сума списується з балансу в повному обсязі.
  // Гроші фізично пішли з картки і не повертаються віртуально в баланс.
  return amt;
}

/**
 * Розраховує нормалізовану щомісячну частку для аналітики та ШІ (без спотворення кеш-балансу)
 */
export function getAmortizedMonthlyExpense(tx: Transaction): number {
  if (tx.exclude_from_budget || tx.type !== "expense" || tx.deleted_at) {
    return 0;
  }
  const amt = Number(tx.amount || 0);
  if (isNaN(amt) || amt <= 0) return 0;

  const amortization = tx.metadata?.amortization;
  if (amortization && typeof amortization === "object") {
    const months = Number(amortization.months);
    if (months > 1 && !isNaN(months)) {
      const monthly =
        Number(amortization.monthly_amount) || Math.round(amt / months);
      return Math.min(amt, Math.max(0, monthly));
    }
  }

  return amt;
}

/**
 * Знаходить активні амортизовані витрати з попередніх місяців та формує список зобов'язань для поточного циклу
 */
export function calculateActivePastAmortizations(
  pastTransactions: Transaction[],
  currentCycleDate: Date = new Date()
): UpcomingObligation[] {
  const obligations: UpcomingObligation[] = [];

  for (const tx of pastTransactions) {
    if (tx.deleted_at || tx.exclude_from_budget) continue;
    const amortization = tx.metadata?.amortization;
    if (!amortization || typeof amortization !== "object") continue;

    const totalMonths = Number(amortization.months);
    if (isNaN(totalMonths) || totalMonths <= 1) continue;

    const rawDate = tx.created_at || (tx as any).date;
    if (!rawDate) continue;
    const txDate = new Date(rawDate);
    if (isNaN(txDate.getTime())) continue;

    // Розраховуємо різницю в місяцях між поточною датою та датою покупки
    const monthDiff =
      (currentCycleDate.getFullYear() - txDate.getFullYear()) * 12 +
      (currentCycleDate.getMonth() - txDate.getMonth());

    // Якщо поточний місяць пізніший за місяць покупки, але в межах періоду амортизації
    if (monthDiff > 0 && monthDiff < totalMonths) {
      const monthlyAmt =
        Number(amortization.monthly_amount) ||
        Math.round(Number(tx.amount || 0) / totalMonths);

      obligations.push({
        title: `🗓️ Амортизація (${monthDiff + 1}/${totalMonths}): ${tx.merchant_raw}`,
        amount: monthlyAmt,
        is_paid: false,
      });
    }
  }

  return obligations;
}

/**
 * За правилом чистого кеш-флоу (Cash Flow): гроші списано на 100% у місяці покупки,
 * тому в наступних місяцях фіктивні зобов'язання не стягуються, щоб уникнути подвійного списання грошей.
 */
export async function loadPastAmortizationObligations(
  _supabaseAdmin: any,
  _startDate: Date,
  _now: Date = new Date()
): Promise<UpcomingObligation[]> {
  return [];
}
