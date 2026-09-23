import * as XLSX from "xlsx";
import { Transaction, InvestmentAsset, SavingsGoal } from "@/types/finance";

interface ExportExcelOptions {
  transactions: Transaction[];
  investments?: InvestmentAsset[];
  savingsGoals?: SavingsGoal[];
  filename?: string;
}

export function exportFinancialDataToExcel({
  transactions,
  investments = [],
  savingsGoals = [],
  filename,
}: ExportExcelOptions) {
  const wb = XLSX.utils.book_new();

  // 1. Лист: Транзакції
  const txRows = transactions.map((t) => {
    const d = new Date(t.created_at);
    const dateFormatted = isNaN(d.getTime())
      ? t.created_at
      : d.toLocaleString("uk-UA", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        });

    let typeLabel = "Витрата";
    if (t.type === "income") typeLabel = "Дохід";
    if (t.type === "investment") typeLabel = "Інвестиція";

    return {
      ID: t.id,
      Дата: dateFormatted,
      "Торговець / Опис": t.merchant_raw,
      Категорія: t.category_name,
      Сума: Number(t.amount) || 0,
      Валюта: t.currency || "UAH",
      "Оригінальна сума": t.original_amount || "",
      "Оригінальна валюта": t.original_currency || "",
      Тип: typeLabel,
      Джерело: t.source || "manual",
      Теги: Array.isArray(t.tags) ? t.tags.join(", ") : "",
      "Враховується в бюджеті": t.exclude_from_budget ? "Ні" : "Так",
    };
  });

  const wsTransactions = XLSX.utils.json_to_sheet(txRows);
  // Налаштування ширини колонок
  wsTransactions["!cols"] = [
    { wch: 8 }, // ID
    { wch: 18 }, // Дата
    { wch: 28 }, // Опис
    { wch: 18 }, // Категорія
    { wch: 12 }, // Сума
    { wch: 8 }, // Валюта
    { wch: 16 }, // Ориг сума
    { wch: 16 }, // Ориг валюта
    { wch: 12 }, // Тип
    { wch: 12 }, // Джерело
    { wch: 20 }, // Теги
    { wch: 22 }, // Враховується
  ];
  XLSX.utils.book_append_sheet(wb, wsTransactions, "Транзакції");

  // 2. Лист: Підсумок за категоріями
  const categoryTotals: Record<string, { total: number; count: number }> = {};
  let totalExpenses = 0;

  transactions.forEach((t) => {
    if (t.type === "expense" && !t.exclude_from_budget) {
      const cat = t.category_name || "Інше";
      const amt = Number(t.amount) || 0;
      if (!categoryTotals[cat]) {
        categoryTotals[cat] = { total: 0, count: 0 };
      }
      categoryTotals[cat].total += amt;
      categoryTotals[cat].count += 1;
      totalExpenses += amt;
    }
  });

  const catRows = Object.entries(categoryTotals)
    .sort((a, b) => b[1].total - a[1].total)
    .map(([cat, stats]) => ({
      Категорія: cat,
      "Сума (₴)": Math.round(stats.total),
      "Частка (%)":
        totalExpenses > 0
          ? Number(((stats.total / totalExpenses) * 100).toFixed(1))
          : 0,
      "Кількість операцій": stats.count,
    }));

  if (catRows.length > 0) {
    catRows.push({
      Категорія: "РАЗОМ ВИТРАТИ",
      "Сума (₴)": Math.round(totalExpenses),
      "Частка (%)": 100,
      "Кількість операцій": transactions.filter((t) => t.type === "expense")
        .length,
    });
    const wsCategories = XLSX.utils.json_to_sheet(catRows);
    wsCategories["!cols"] = [
      { wch: 22 },
      { wch: 14 },
      { wch: 12 },
      { wch: 18 },
    ];
    XLSX.utils.book_append_sheet(wb, wsCategories, "Категорії");
  }

  // 3. Лист: Інвестиції
  if (investments.length > 0) {
    const investRows = investments.map((inv) => {
      const invested = Number(inv.invested_amount) || 0;
      const current = Number(inv.current_value) || 0;
      const totalCoupons = Array.isArray(inv.coupons)
        ? inv.coupons.reduce((sum, c) => sum + (Number(c.amount) || 0), 0)
        : 0;
      const pnl = current + totalCoupons - invested;
      const pnlPercent =
        invested > 0 ? ((pnl / invested) * 100).toFixed(1) + "%" : "0%";

      let typeLabel: string = inv.asset_type;
      if (inv.asset_type === "bonds") typeLabel = "ОВДП";
      if (inv.asset_type === "stocks") typeLabel = "Акції / ETF";
      if (inv.asset_type === "crypto") typeLabel = "Криптовалюта";
      if (inv.asset_type === "deposit") typeLabel = "Депозит";
      if (inv.asset_type === "reit") typeLabel = "REIT";

      return {
        Актив: inv.asset_name,
        Тип: typeLabel,
        "Вкладено (Cost)": invested,
        "Поточна вартість (Тіло)": current,
        "Отримано купонів": totalCoupons > 0 ? totalCoupons : "",
        "Прибуток / Збиток (P&L)": pnl,
        "Дохідність (%)": pnlPercent,
        Валюта: inv.currency,
        "Очікувана річна ставка (%)": inv.yield_percent || "",
        "Дата погашення": inv.maturity_date || "",
        Нотатки: inv.notes || "",
      };
    });

    const wsInvest = XLSX.utils.json_to_sheet(investRows);
    wsInvest["!cols"] = [
      { wch: 24 },
      { wch: 14 },
      { wch: 16 },
      { wch: 22 },
      { wch: 18 },
      { wch: 22 },
      { wch: 14 },
      { wch: 8 },
      { wch: 24 },
      { wch: 16 },
      { wch: 28 },
    ];
    XLSX.utils.book_append_sheet(wb, wsInvest, "Інвестиції");
  }

  // 4. Лист: Скарбнички
  if (savingsGoals.length > 0) {
    const goalsRows = savingsGoals.map((g) => {
      const current = Number(g.current_amount) || 0;
      const hasTarget = g.target_amount != null && Number(g.target_amount) > 0;
      const target = hasTarget ? Number(g.target_amount) : "Не обмежено";
      const progress = hasTarget
        ? ((current / Number(g.target_amount)) * 100).toFixed(1) + "%"
        : "Без ліміту";

      return {
        "Ціль / Скарбничка": g.name,
        Накопичено: current,
        Ціль: target,
        "Прогрес (%)": progress,
        Валюта: g.currency,
        "Дедлайн цілі": g.target_date || "",
      };
    });

    const wsGoals = XLSX.utils.json_to_sheet(goalsRows);
    wsGoals["!cols"] = [
      { wch: 24 },
      { wch: 14 },
      { wch: 14 },
      { wch: 14 },
      { wch: 8 },
      { wch: 16 },
    ];
    XLSX.utils.book_append_sheet(wb, wsGoals, "Скарбнички");
  }

  const today = new Date().toISOString().slice(0, 10);
  const outName = filename || `BudgetGraph_Export_${today}.xlsx`;

  XLSX.writeFile(wb, outName);
}
