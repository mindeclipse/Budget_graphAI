import { Transaction, RecurringItem } from "@/types/finance";
import { cleanMerchantRaw } from "@/lib/normalize";
import {
  ScheduleItemStatus,
  UpcomingScheduleItem,
  SubscriptionRadarMetrics,
} from "./types";

/**
 * Будує графік майбутніх списань на поточний місяць та розраховує фінансові метрики.
 */
export function buildUpcomingSchedule(
  templates: RecurringItem[],
  currentMonthTransactions: Transaction[],
  usdRate: number = 44.0,
  referenceDate: Date = new Date()
): { upcoming: UpcomingScheduleItem[]; metrics: SubscriptionRadarMetrics } {
  const activeTemplates = templates.filter((t) => t.is_active);
  const currentDay = referenceDate.getDate();

  // Витрати поточного місяця
  const monthExpenses = currentMonthTransactions.filter(
    (t) => t.type === "expense" && !t.exclude_from_budget
  );

  const upcoming: UpcomingScheduleItem[] = [];

  let monthlyTotal = 0;
  let paidThisMonth = 0;
  let remainingThisMonth = 0;

  for (const tmpl of activeTemplates) {
    const isUsd = tmpl.currency === "USD";
    const expectedUah = isUsd
      ? Math.round(Number(tmpl.amount) * usdRate)
      : Number(tmpl.amount);

    monthlyTotal += expectedUah;

    // Шукаємо, чи була вже транзакція для цього шаблону в поточному періоді
    const matchedTx = monthExpenses.find((tx) => {
      // 0. Прямий збіг за ID шаблону в метаданих транзакції
      const metaRecId = (tx as any).metadata?.recurring_id;
      if (metaRecId != null && Number(metaRecId) === tmpl.id) {
        return true;
      }

      // 1. Якщо джерело 'recurring' і збігається назва
      if (
        tx.source === "recurring" &&
        (tx.merchant_raw.toLowerCase().includes(tmpl.title.toLowerCase()) ||
          tmpl.title.toLowerCase().includes(tx.merchant_raw.toLowerCase()))
      ) {
        return true;
      }

      // 2. Якщо це звичайна транзакція з подібним мерчантом і сумою (±15%)
      const cleanTx = cleanMerchantRaw(tx.merchant_raw).toLowerCase();
      const cleanTmpl = cleanMerchantRaw(tmpl.title).toLowerCase();

      const nameMatch =
        cleanTx.includes(cleanTmpl) ||
        cleanTmpl.includes(cleanTx) ||
        tx.merchant_raw.toLowerCase().includes(tmpl.title.toLowerCase()) ||
        tmpl.title.toLowerCase().includes(tx.merchant_raw.toLowerCase());

      const amountMatch =
        Math.abs(Number(tx.amount) - expectedUah) / Math.max(1, expectedUah) <=
        0.15;

      return nameMatch && amountMatch;
    });

    let status: ScheduleItemStatus;
    let daysRemaining = tmpl.day_of_month - currentDay;

    if (matchedTx) {
      status = "paid";
      daysRemaining = 0;
      paidThisMonth += Number(matchedTx.amount);
    } else {
      if (tmpl.day_of_month === currentDay) {
        status = "due_today";
        daysRemaining = 0;
      } else if (tmpl.day_of_month > currentDay) {
        status = "upcoming";
      } else {
        status = "overdue";
      }
      remainingThisMonth += expectedUah;
    }

    upcoming.push({
      id: tmpl.id,
      title: tmpl.title,
      amount: Number(tmpl.amount),
      currency: tmpl.currency || "UAH",
      category_name: tmpl.category_name,
      day_of_month: tmpl.day_of_month,
      status,
      days_remaining: daysRemaining,
      paid_at: matchedTx?.created_at,
      paid_amount: matchedTx ? Number(matchedTx.amount) : undefined,
      matched_transaction_id: matchedTx ? matchedTx.id : undefined,
    });
  }

  // Сортуємо: спочатку актуальні та майбутні (сьогодні, найближчі дні), потім прострочені, в кінці вже сплачені
  const statusOrder: Record<ScheduleItemStatus, number> = {
    due_today: 0,
    upcoming: 1,
    overdue: 2,
    paid: 3,
  };

  upcoming.sort((a, b) => {
    if (statusOrder[a.status] !== statusOrder[b.status]) {
      return statusOrder[a.status] - statusOrder[b.status];
    }
    return a.day_of_month - b.day_of_month;
  });

  const annualTotal = monthlyTotal * 12;

  return {
    upcoming,
    metrics: {
      monthly_total: monthlyTotal,
      annual_total: annualTotal,
      paid_this_month: paidThisMonth,
      remaining_this_month: remainingThisMonth,
      detected_count: 0, // буде додано в контролері
    },
  };
}
