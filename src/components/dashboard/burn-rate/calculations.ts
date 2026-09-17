import {
  BurnRatePoint,
  CalculateBurnRateParams,
  BurnRateResult,
} from "./types";

export function calculateBurnRateData({
  transactions,
  budgetLimit,
  recurringTotal = 0,
  selectedMonthKey,
  recurring = [],
  usdRate = 41.5,
  activeCycle = null,
  currentDate,
}: CalculateBurnRateParams): BurnRateResult {
  const variableBudget = Math.max(0, budgetLimit - recurringTotal);
  const now = currentDate || new Date();

  const [yearStr, monthStr] = (selectedMonthKey || "").split("-");
  const year = parseInt(yearStr, 10) || now.getFullYear();
  const monthIndex = (parseInt(monthStr, 10) || 1) - 1;

  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const isCurrentMonth =
    now.getFullYear() === year && now.getMonth() === monthIndex;
  const isFutureMonth = new Date(year, monthIndex, 1) > now;

  const isCycleMode = Boolean(
    activeCycle && isCurrentMonth && activeCycle.start_date
  );

  if (isCycleMode && activeCycle) {
    const startRaw = new Date(activeCycle.start_date);
    const cycleStart = new Date(
      startRaw.getFullYear(),
      startRaw.getMonth(),
      startRaw.getDate()
    );

    let cycleEnd: Date;
    if (activeCycle.end_date) {
      const endRaw = new Date(activeCycle.end_date);
      cycleEnd = new Date(
        endRaw.getFullYear(),
        endRaw.getMonth(),
        endRaw.getDate()
      );
    } else {
      cycleEnd = new Date(
        cycleStart.getFullYear(),
        cycleStart.getMonth(),
        cycleStart.getDate() + 30
      );
    }

    const totalDays = Math.max(
      1,
      Math.round((cycleEnd.getTime() - cycleStart.getTime()) / 86400000)
    );

    const todayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    );
    let currentDay = 0;
    if (todayStart < cycleStart) {
      currentDay = 0;
    } else {
      const diffDays =
        Math.round((todayStart.getTime() - cycleStart.getTime()) / 86400000) +
        1;
      currentDay = Math.min(totalDays, Math.max(1, diffDays));
    }

    const dailyVariableAllowance = variableBudget / totalDays;

    const dailyExpenses: Record<number, number> = {};
    for (let d = 1; d <= totalDays; d++) {
      dailyExpenses[d] = 0;
    }

    transactions.forEach((tx) => {
      if (tx.exclude_from_budget) return;
      if (tx.type && tx.type !== "expense") return;
      const tDate = new Date(tx.created_at);
      const tDayStart = new Date(
        tDate.getFullYear(),
        tDate.getMonth(),
        tDate.getDate()
      );
      const dayIndex =
        Math.round((tDayStart.getTime() - cycleStart.getTime()) / 86400000) + 1;
      if (dayIndex >= 1 && dayIndex <= totalDays) {
        dailyExpenses[dayIndex] =
          (dailyExpenses[dayIndex] || 0) + Number(tx.amount || 0);
      }
    });

    const recurringByDay: Record<number, number> = {};
    let totalRecurringParsed = 0;

    const normalizedRecurring = recurring
      .filter((item) => item.is_active !== false)
      .map((item) => {
        const amount =
          item.currency === "USD"
            ? Number(item.amount) * usdRate
            : Number(item.amount);
        return {
          day_of_month: item.day_of_month,
          amount,
        };
      });

    normalizedRecurring.forEach((item) => {
      totalRecurringParsed += item.amount;
    });

    for (let d = 1; d <= totalDays; d++) {
      const dateForDay = new Date(
        cycleStart.getFullYear(),
        cycleStart.getMonth(),
        cycleStart.getDate() + (d - 1)
      );
      const calDay = dateForDay.getDate();
      const daysInThisMonth = new Date(
        dateForDay.getFullYear(),
        dateForDay.getMonth() + 1,
        0
      ).getDate();

      normalizedRecurring.forEach((item) => {
        const targetDom = Math.min(
          Math.max(1, item.day_of_month),
          daysInThisMonth
        );
        if (calDay === targetDom) {
          recurringByDay[d] = (recurringByDay[d] || 0) + item.amount;
        }
      });
    }

    let runningTotal = 0;
    let runningRecurringPlan = 0;
    const data: BurnRatePoint[] = [];

    for (let d = 1; d <= totalDays; d++) {
      const dateForDay = new Date(
        cycleStart.getFullYear(),
        cycleStart.getMonth(),
        cycleStart.getDate() + (d - 1)
      );
      const dateLabel = `${dateForDay.getDate()}.${String(
        dateForDay.getMonth() + 1
      ).padStart(2, "0")}`;

      if (recurringByDay[d]) {
        runningRecurringPlan += recurringByDay[d];
      }

      const scheduledSoFar =
        normalizedRecurring.length > 0
          ? runningRecurringPlan
          : (recurringTotal / totalDays) * d;

      const ideal = Math.round(d * dailyVariableAllowance + scheduledSoFar);

      if (d <= currentDay && !isFutureMonth) {
        runningTotal += dailyExpenses[d] || 0;
        data.push({
          day: d,
          dateLabel,
          ideal,
          actual: Math.round(runningTotal),
          dropToday: recurringByDay[d] || 0,
        });
      } else {
        data.push({
          day: d,
          dateLabel,
          ideal,
          actual: null,
          dropToday: recurringByDay[d] || 0,
        });
      }
    }

    const activeRecurringTotal =
      normalizedRecurring.length > 0 ? totalRecurringParsed : recurringTotal;
    const variableSpentSoFar = Math.max(0, runningTotal - runningRecurringPlan);
    const projectedVariable =
      currentDay > 0 ? (variableSpentSoFar / currentDay) * totalDays : 0;
    const projectedMonthEnd = Math.round(
      projectedVariable + activeRecurringTotal
    );

    return {
      data,
      currentDay,
      totalDays,
      isCurrentMonth,
      isFutureMonth,
      isCycleMode: true,
      runningTotal: Math.round(runningTotal),
      projectedMonthEnd,
    };
  }

  // --- Calendar fallback mode (archive months or no active cycle) ---
  const currentDay = isCurrentMonth
    ? now.getDate()
    : isFutureMonth
      ? 0
      : daysInMonth;

  const dailyVariableAllowance = variableBudget / daysInMonth;

  const dailyExpenses: Record<number, number> = {};
  for (let d = 1; d <= daysInMonth; d++) {
    dailyExpenses[d] = 0;
  }

  transactions.forEach((tx) => {
    if (tx.exclude_from_budget) return;
    if (tx.type && tx.type !== "expense") return;
    const txDate = new Date(tx.created_at);
    const day = txDate.getDate();
    if (day >= 1 && day <= daysInMonth) {
      dailyExpenses[day] = (dailyExpenses[day] || 0) + Number(tx.amount || 0);
    }
  });

  const recurringByDay: Record<number, number> = {};
  let totalRecurringParsed = 0;

  recurring.forEach((item) => {
    const day = Math.min(Math.max(1, item.day_of_month), daysInMonth);
    const amount =
      item.currency === "USD"
        ? Number(item.amount) * usdRate
        : Number(item.amount);
    recurringByDay[day] = (recurringByDay[day] || 0) + amount;
    totalRecurringParsed += amount;
  });

  let runningTotal = 0;
  let runningRecurringPlan = 0;
  const data: BurnRatePoint[] = [];

  for (let d = 1; d <= daysInMonth; d++) {
    const dateLabel = `${d}.${String(monthIndex + 1).padStart(2, "0")}`;

    if (recurringByDay[d]) {
      runningRecurringPlan += recurringByDay[d];
    }

    const scheduledSoFar =
      recurring.length > 0
        ? runningRecurringPlan
        : (recurringTotal / daysInMonth) * d;

    const ideal = Math.round(d * dailyVariableAllowance + scheduledSoFar);

    if (d <= currentDay && !isFutureMonth) {
      runningTotal += dailyExpenses[d] || 0;
      data.push({
        day: d,
        dateLabel,
        ideal,
        actual: Math.round(runningTotal),
        dropToday: recurringByDay[d] || 0,
      });
    } else {
      data.push({
        day: d,
        dateLabel,
        ideal,
        actual: null,
        dropToday: recurringByDay[d] || 0,
      });
    }
  }

  const activeRecurringTotal =
    recurring.length > 0 ? totalRecurringParsed : recurringTotal;
  const variableSpentSoFar = Math.max(0, runningTotal - runningRecurringPlan);
  const projectedVariable =
    currentDay > 0 ? (variableSpentSoFar / currentDay) * daysInMonth : 0;
  const projectedMonthEnd = Math.round(
    projectedVariable + activeRecurringTotal
  );

  return {
    data,
    currentDay,
    totalDays: daysInMonth,
    isCurrentMonth,
    isFutureMonth,
    isCycleMode: false,
    runningTotal: Math.round(runningTotal),
    projectedMonthEnd,
  };
}
