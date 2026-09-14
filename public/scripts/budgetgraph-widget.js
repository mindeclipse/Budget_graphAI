// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: green; icon-glyph: chart-line;

/**
 * =========================================================================
 * 📱 BudgetGraph — Нативний віджет для iOS (Scriptable)
 * =========================================================================
 * 
 * Інструкція з налаштування:
 * 1. Встановіть безкоштовний додаток Scriptable з App Store на iPhone.
 * 2. Створіть новий скрипт, назвіть його "BudgetGraph" та вставте цей код.
 * 3. Додайте віджет Scriptable (Small або Medium) на екран «Додому».
 * 4. Затисніть віджет -> "Змінити віджет" -> у полі "Parameter" вкажіть:
 *    https://your-domain.vercel.app,ВАШ_APP_API_SECRET
 *    (або пропишіть константи BASE_URL та API_KEY нижче).
 */

const DEFAULT_BASE_URL = "https://budget-pwa.vercel.app";
const DEFAULT_API_KEY = ""; // Вставте свій APP_API_SECRET за потреби
const FORCE_DARK_MODE = true; // Завжди увімкнена темна тема (OLED Dark)

// Парсинг параметрів віджета (URL,API_KEY)
let baseUrl = DEFAULT_BASE_URL;
let apiKey = DEFAULT_API_KEY;

if (args.widgetParameter) {
  const parts = args.widgetParameter.split(",");
  if (parts[0] && parts[0].trim()) {
    baseUrl = parts[0].trim().replace(/\/+$/, "");
  }
  if (parts[1] && parts[1].trim()) {
    apiKey = parts[1].trim();
  }
}

// Завантаження або кеш
const fm = FileManager.local();
const cacheDir = fm.documentsDirectory();
const cacheFile = fm.joinPath(cacheDir, "budgetgraph_widget_cache.json");

async function fetchWidgetData() {
  const endpoint = `${baseUrl}/api/widget/summary`;
  const req = new Request(endpoint);
  req.timeoutInterval = 10;
  req.headers = {
    "Accept": "application/json",
    ...(apiKey ? { "Authorization": `Bearer ${apiKey}` } : {}),
  };

  try {
    const json = await req.loadJSON();
    if (json && json.success) {
      // Зберігаємо свіжий кеш
      fm.writeString(cacheFile, JSON.stringify(json));
      return { data: json, isOffline: false };
    }
  } catch (err) {
    console.warn("Помилка завантаження даних віджета, перехід на кеш:", err);
  }

  // Fallback на локальний кеш
  if (fm.fileExists(cacheFile)) {
    try {
      const cachedStr = fm.readString(cacheFile);
      const cachedJson = JSON.parse(cachedStr);
      return { data: cachedJson, isOffline: true };
    } catch (cacheErr) {
      console.error("Помилка читання кешу:", cacheErr);
    }
  }

  return { data: null, isOffline: true };
}

function formatMoney(num) {
  return Math.round(Number(num || 0)).toLocaleString("uk-UA");
}

function getStatusColor(status) {
  switch (status) {
    case "exceeded":
      return new Color("#ef4444"); // Червоний
    case "warning":
      return new Color("#f59e0b"); // Жовтий / бурштиновий
    case "on_track":
    default:
      return new Color("#10b981"); // Смарагдовий зелений
  }
}

function getStatusBadge(status) {
  switch (status) {
    case "exceeded":
      return { text: "Перевищення", color: new Color("#ef4444") };
    case "warning":
      return { text: "Увага", color: new Color("#f59e0b") };
    case "on_track":
    default:
      return { text: "У нормі", color: new Color("#10b981") };
  }
}

// =========================================================================
// Створення віджета
// =========================================================================
async function createWidget() {
  const { data, isOffline } = await fetchWidgetData();
  const widget = new ListWidget();
  widget.url = baseUrl;

  // Дизайн фону (OLED Dark з глибоким відтінком)
  const isDark = FORCE_DARK_MODE ? true : Device.isUsingDarkAppearance();
  const bgColor = isDark ? new Color("#080b12") : new Color("#f8fafc");
  widget.backgroundColor = bgColor;
  widget.setPadding(14, 14, 14, 14);

  const textPrimary = isDark ? new Color("#f8fafc") : new Color("#0f172a");
  const textSecondary = isDark ? new Color("#94a3b8") : new Color("#64748b");
  const cardBg = isDark ? new Color("#131a29") : new Color("#ffffff");

  if (!data) {
    const errorText = widget.addText("⚠️ Налаштуйте віджет");
    errorText.font = Font.boldSystemFont(14);
    errorText.textColor = textPrimary;

    widget.addSpacer(4);
    const sub = widget.addText("Вкажіть URL та API Secret у параметрах.");
    sub.font = Font.systemFont(11);
    sub.textColor = textSecondary;
    return widget;
  }

  const statusInfo = getStatusBadge(data.spendPaceStatus);
  const statusColor = getStatusColor(data.spendPaceStatus);

  const widgetFamily = config.widgetFamily || "medium";

  if (widgetFamily === "small") {
    // =====================================================================
    // SMALL WIDGET (Компактний 2x2)
    // =====================================================================
    // Шапка: Назва та статус-крапка
    const topRow = widget.addStack();
    topRow.layoutHorizontally();

    const title = topRow.addText("BudgetGraph");
    title.font = Font.boldSystemFont(12);
    title.textColor = new Color("#38bdf8"); // Neon Cyan

    topRow.addSpacer();

    const dot = topRow.addText("●");
    dot.font = Font.boldSystemFont(10);
    dot.textColor = statusColor;

    widget.addSpacer(8);

    // Основна цифра: Залишок на сьогодні
    const label = widget.addText(data.todayRemaining > 0 ? "СЬОГОДНІ ВІЛЬНО" : "ПЕРЕВИТРАТА");
    label.font = Font.systemFont(9);
    label.textColor = textSecondary;

    widget.addSpacer(2);

    const mainNum = widget.addText(`${formatMoney(data.todayRemaining > 0 ? data.todayRemaining : data.todaySpent - data.safeDailySpend)} ₴`);
    mainNum.font = Font.boldRoundedSystemFont(22);
    mainNum.textColor = data.todayRemaining > 0 ? textPrimary : statusColor;

    widget.addSpacer(2);

    const subPace = widget.addText(`Норма: ${formatMoney(data.safeDailySpend)} ₴/д`);
    subPace.font = Font.systemFont(10);
    subPace.textColor = textSecondary;

    widget.addSpacer();

    // Футер: Залишок циклу
    const footer = widget.addStack();
    footer.layoutHorizontally();

    const cycleRest = footer.addText(`${formatMoney(data.remainingBudget)} ₴`);
    cycleRest.font = Font.boldSystemFont(11);
    cycleRest.textColor = textPrimary;

    footer.addSpacer();

    const days = footer.addText(`${data.daysRemaining} дн.`);
    days.font = Font.systemFont(10);
    days.textColor = textSecondary;

  } else {
    // =====================================================================
    // MEDIUM WIDGET (Горизонтальний 4x2)
    // =====================================================================
    const mainStack = widget.addStack();
    mainStack.layoutHorizontally();
    mainStack.centerAlignContent();

    // --- ЛІВА КОЛОНКА (Денний темп) ---
    const leftCol = mainStack.addStack();
    leftCol.layoutVertically();

    // Заголовок
    const leftTop = leftCol.addStack();
    leftTop.layoutHorizontally();

    const appName = leftTop.addText("BudgetGraph");
    appName.font = Font.boldSystemFont(12);
    appName.textColor = new Color("#38bdf8");

    if (isOffline) {
      leftTop.addSpacer(4);
      const offBadge = leftTop.addText("• офлайн");
      offBadge.font = Font.systemFont(9);
      offBadge.textColor = textSecondary;
    }

    leftCol.addSpacer(6);

    const todayLabel = leftCol.addText(data.todayRemaining > 0 ? "Сьогодні вільно:" : "Перевищення норми:");
    todayLabel.font = Font.systemFont(10);
    todayLabel.textColor = textSecondary;

    const todayVal = leftCol.addText(`${formatMoney(data.todayRemaining > 0 ? data.todayRemaining : data.todaySpent - data.safeDailySpend)} ₴`);
    todayVal.font = Font.boldRoundedSystemFont(24);
    todayVal.textColor = data.todayRemaining > 0 ? statusColor : new Color("#ef4444");

    leftCol.addSpacer(4);

    const paceRow = leftCol.addStack();
    paceRow.layoutHorizontally();

    const spentTodayText = paceRow.addText(`Витрачено: ${formatMoney(data.todaySpent)} ₴`);
    spentTodayText.font = Font.systemFont(10);
    spentTodayText.textColor = textSecondary;

    paceRow.addSpacer(6);

    const normText = paceRow.addText(`(з ${formatMoney(data.safeDailySpend)} ₴)`);
    normText.font = Font.systemFont(10);
    normText.textColor = textSecondary;

    leftCol.addSpacer(8);

    // Статус-бейдж
    const badgeStack = leftCol.addStack();
    badgeStack.backgroundColor = statusColor;
    badgeStack.cornerRadius = 6;
    badgeStack.setPadding(2, 6, 2, 6);

    const badgeText = badgeStack.addText(statusInfo.text);
    badgeText.font = Font.boldSystemFont(10);
    badgeText.textColor = new Color("#ffffff");

    mainStack.addSpacer(16);

    // Розділювач
    const divider = mainStack.addStack();
    divider.size = new Size(1, 110);
    divider.backgroundColor = isDark ? new Color("#1e293b") : new Color("#e2e8f0");

    mainStack.addSpacer(16);

    // --- ПРАВА КОЛОНКА (Стан циклу & остання покупка) ---
    const rightCol = mainStack.addStack();
    rightCol.layoutVertically();

    const cycleTitle = rightCol.addText(`🗓 ${data.cycleName}`);
    cycleTitle.font = Font.boldSystemFont(11);
    cycleTitle.textColor = textPrimary;
    cycleTitle.lineLimit = 1;

    rightCol.addSpacer(4);

    const cycleRemainText = rightCol.addText(`Вільний залишок: ${formatMoney(data.remainingBudget)} ₴`);
    cycleRemainText.font = Font.systemFont(10);
    cycleRemainText.textColor = textSecondary;

    rightCol.addSpacer(2);

    const daysRow = rightCol.addStack();
    daysRow.layoutHorizontally();

    const daysText = daysRow.addText(`Залишилось: ${data.daysRemaining} дн.`);
    daysText.font = Font.boldSystemFont(10);
    daysText.textColor = textPrimary;

    daysRow.addSpacer();

    const progressText = daysRow.addText(`${data.cycleProgressPercent}% циклу`);
    progressText.font = Font.systemFont(10);
    progressText.textColor = textSecondary;

    rightCol.addSpacer(10);

    // Остання покупка
    if (data.lastTransaction) {
      const txBox = rightCol.addStack();
      txBox.backgroundColor = cardBg;
      txBox.cornerRadius = 8;
      txBox.setPadding(6, 8, 6, 8);
      txBox.layoutHorizontally();

      const txInfo = txBox.addStack();
      txInfo.layoutVertically();

      const txMerchant = txInfo.addText(data.lastTransaction.merchant);
      txMerchant.font = Font.systemFont(10);
      txMerchant.textColor = textPrimary;
      txMerchant.lineLimit = 1;

      const txTime = txInfo.addText(data.lastTransaction.time);
      txTime.font = Font.systemFont(8);
      txTime.textColor = textSecondary;

      txBox.addSpacer();

      const txAmount = txBox.addText(`-${formatMoney(data.lastTransaction.amount)} ₴`);
      txAmount.font = Font.boldSystemFont(11);
      txAmount.textColor = new Color("#ef4444");
    } else {
      const noTx = rightCol.addText("Витрат сьогодні не було");
      noTx.font = Font.italicSystemFont(10);
      noTx.textColor = textSecondary;
    }
  }

  return widget;
}

// Запуск віджета або попередній перегляд у Scriptable
if (config.runsInWidget) {
  const widget = await createWidget();
  Script.setWidget(widget);
} else {
  // Для тестування всередині додатку Scriptable
  const widget = await createWidget();
  if (config.widgetFamily === "small") {
    await widget.presentSmall();
  } else {
    await widget.presentMedium();
  }
}
Script.complete();
