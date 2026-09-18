import { tryFastNaturalLanguageParse } from "./fast-heuristics";

/**
 * Перевіряє, чи є текст запитом про стан/темп бюджету
 */
export function isPaceInquiry(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (/^\/(pace|today|budget)$/i.test(t)) return true;
  if (
    /^(🎯\s*)?(темп|мій темп|який темп|який мій темп|який темп бюджету)\s*(\?+)?$/i.test(
      t
    )
  ) {
    return true;
  }
  if (/^скільки (можу|можна) витратити( сьогодні)?\s*(\?+)?$/i.test(t)) {
    return true;
  }
  if (
    /^скільки на день\s*(\?+)?$|^безпечно на день\s*(\?+)?$|^ліміт на день\s*(\?+)?$/i.test(
      t
    )
  ) {
    return true;
  }
  if (
    /^(чи є гроші|який залишок|скільки залишилось( грошей)?)\s*(\?+)?$/i.test(t)
  ) {
    return true;
  }
  if (/^(ліміт на вихідні|скільки на вихідні)\s*(\?+)?$/i.test(t)) return true;
  return false;
}

/**
 * Перевіряє, чи є текст запитом про підсумок/залишок циклу
 */
export function isCycleSummaryInquiry(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (/^\/(cycle|period|summary)$/i.test(t)) return true;
  if (
    /^(📊\s*)?(залишок циклу|підсумок циклу|баланс циклу|стан циклу|мій цикл)\s*(\?+)?$/i.test(
      t
    )
  ) {
    return true;
  }
  if (
    /^(скільки (залишилось|лишилось) до кінця циклу|скільки (залишилось|лишилось) до кінця місяця)\s*(\?+)?$/i.test(
      t
    )
  ) {
    return true;
  }
  return false;
}

/**
 * Перевіряє, чи є текст запитом про графічну картку / дашборд / діаграму
 */
export function isChartInquiry(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (/^\/(chart|graph|dashboard|stats|image)$/i.test(t)) return true;
  if (
    /^(📈\s*|📊\s*)?(графік|графіки|дашборд|діаграма|інфографіка|покажи графік|покажи дашборд|візуалізація|прогрес-бар)\s*(\?+)?$/i.test(
      t
    )
  ) {
    return true;
  }
  return false;
}

/**
 * Перевіряє, чи є текст запитом про стан фінансової подушки безпеки
 */
export function isEmergencyFundInquiry(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (/^\/(cushion|fund|pillow|roundup|savings)$/i.test(t)) return true;
  if (
    /^(🛡️?\s*|🏦\s*)?(подушка|фінансова подушка|скарбничка|накопичення|заощадження|решта|округлення)\s*(\?+)?$/i.test(
      t
    )
  ) {
    return true;
  }
  if (
    /^(скільки в подушці|скільки на подушці|стан подушки)\s*(\?+)?$/i.test(t)
  ) {
    return true;
  }
  return false;
}

/**
 * Перевіряє, чи є текст запитом про інструкцію/довідку щодо симулятора покупок What-If
 */
export function isWhatIfGuideInquiry(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (/^\/(whatif|simulator|calc)$/i.test(t)) return true;
  if (
    /^(💡\s*)?що якщо(\.{1,3})?(\?+)?$/i.test(t) ||
    /^(💡\s*)?(симулятор|симулятор покупок|як працює що якщо)\s*(\?+)?$/i.test(
      t
    )
  ) {
    return true;
  }
  return false;
}

/**
 * Парсить запит «What-If»: чи можу я дозволити покупку на певну суму
 */
export function parseWhatIfPurchaseQuery(
  text: string
): { amount: number; item?: string } | null {
  const t = text.trim();

  // 0. Пряма команда або префікс: /whatif 1500, /whatif кросівки 2500, /whatif 2500 кросівки
  const cmdMatch = t.match(
    /^(?:\/(?:whatif|simulator|calc)|(?:💡\s*)?що якщо)\s+(.+)$/i
  );
  if (cmdMatch) {
    const rest = cmdMatch[1].trim();

    // Шаблон А: Число першим — "/whatif 2500" або "/whatif 2500 кросівки"
    const numFirst = rest.match(
      /^(\d+(?:[.,]\d+)?)\s*(?:грн|₴)?(?:\s+(?:на|для)?\s*(.+))?$/i
    );
    if (numFirst) {
      const amount = parseFloat(numFirst[1].replace(",", "."));
      if (!isNaN(amount) && amount > 0) {
        return { amount, item: numFirst[2]?.trim() || "планова покупка" };
      }
    }

    // Шаблон Б: Назва першою — "/whatif кросівки 2500" або "/whatif на кросівки 2500 грн"
    const textFirst = rest.match(
      /^(?:на|для)?\s*(.+?)\s+(\d+(?:[.,]\d+)?)\s*(?:грн|₴)?$/i
    );
    if (textFirst) {
      const amount = parseFloat(textFirst[2].replace(",", "."));
      if (!isNaN(amount) && amount > 0) {
        return { amount, item: textFirst[1].trim() };
      }
    }
  }

  const hasWhatIfMarker =
    /^(чи\s+)?(можу|хочу|планую|чи\s+норм|чи\s+варто|чи\s+можна)\s+(купити|дозволити|взяти|витратити|замовити)/i.test(
      t
    ) ||
    /^(чи\s+можу\s+я|чи\s+можу\s+собі\s+дозволити)/i.test(t) ||
    /^(можу\s+дозволити|можу\s+собі\s+дозволити)/i.test(t) ||
    /(чи\s+норм\??|чи\s+ок\??|чи\s+вистачить\??)$/i.test(t);

  if (!hasWhatIfMarker) return null;

  // 1. Патерн: "хочу купити [річ] за [сума]" / "чи можу купити [річ] за [сума] грн"
  const match1 = t.match(
    /(?:купити|дозволити|взяти|замовити)\s+(.+?)\s+(?:за|на)\s+(\d+(?:[.,]\d+)?)\s*(?:грн|₴)?/i
  );
  if (match1) {
    const item = match1[1].replace(/^(собі|ще|зараз)\s+/i, "").trim();
    const amount = parseFloat(match1[2].replace(",", "."));
    if (!isNaN(amount) && amount > 0) {
      return { amount, item };
    }
  }

  // 2. Патерн: "чи можу витратити [сума] на [річ]"
  const match2 = t.match(
    /(?:витратити)\s+(\d+(?:[.,]\d+)?)\s*(?:грн|₴)?(?:\s+(?:на|для)\s+(.+))?/i
  );
  if (match2) {
    const amount = parseFloat(match2[1].replace(",", "."));
    const item = match2[2]?.trim();
    if (!isNaN(amount) && amount > 0) {
      return { amount, item: item || "покупка" };
    }
  }

  // 3. Патерн: "хочу купити [річ] [сума]"
  const match3 = t.match(
    /(?:купити|дозволити|взяти|замовити)\s+(.+?)\s+(\d+(?:[.,]\d+)?)\s*(?:грн|₴)?(?:\s*,\s*чи\s+норм|\s*\?)?$/i
  );
  if (match3) {
    const item = match3[1].trim();
    const amount = parseFloat(match3[2].replace(",", "."));
    if (!isNaN(amount) && amount > 0) {
      return { amount, item };
    }
  }

  // 4. Патерн: "планую покупку [сума]"
  const match4 = t.match(
    /(?:покупк[ау]|витрат[ау])\s+(?:на\s+)?(\d+(?:[.,]\d+)?)\s*(?:грн|₴)?/i
  );
  if (match4) {
    const amount = parseFloat(match4[1].replace(",", "."));
    if (!isNaN(amount) && amount > 0) {
      return { amount, item: "планова покупка" };
    }
  }

  return null;
}

/**
 * Перевіряє, чи є текст аналітичним запитом природною мовою до фінансового асистента
 */
export function isFinancialInquiry(text: string): boolean {
  const t = text.trim();
  if (!t) return false;

  // 1. Ігноруємо системні команди
  if (
    /^\/(start|help|menu|pace|cycle|chart|cushion|fund|roundup|savings|whatif|simulator|calc)/i.test(
      t
    )
  ) {
    return false;
  }

  // 2. Ігноруємо прямі кнопки швидких дій (мають власні швидкі обробники)
  if (
    isPaceInquiry(t) ||
    isCycleSummaryInquiry(t) ||
    isChartInquiry(t) ||
    isEmergencyFundInquiry(t) ||
    isWhatIfGuideInquiry(t) ||
    parseWhatIfPurchaseQuery(t) !== null
  ) {
    return false;
  }

  // 3. Ігноруємо явні записи витрат через Fast-Path (наприклад "кава 85", "таксі 240")
  if (tryFastNaturalLanguageParse(t) !== null) {
    return false;
  }

  // 4. Якщо повідомлення починається з мерчанта і суми ("Сільпо 500", "АЗС 1500 паливо"), це витрата
  if (
    /^[a-zа-яіїєґ0-9\s#№.'"-]{2,30}\s+\d+(?:[.,]\d+)?(?:\s+(?:грн|₴))?/i.test(t)
  ) {
    const words = t.split(/\s+/);
    const hasQuestionWords =
      /^(скільки|як|чи|які|яка|який|де|коли|чому|що|на що|покажи|підкажи|проаналізуй|статистика|звіт|топ|порадь|допоможи|розкажи)/i.test(
        t
      );
    if (!hasQuestionWords && !t.includes("?")) {
      const hasNumber = words.some((w) =>
        /^\d+(?:[.,]\d+)?(?:грн|₴)?$/i.test(w)
      );
      if (hasNumber && words.length <= 4) {
        return false;
      }
    }
  }

  // 5. Маркери аналітичного запитання:
  // А. Наявність знака питання
  if (t.includes("?")) {
    return true;
  }

  // Б. Питальні слова або прохання аналітики на початку
  const startsWithInquiry =
    /^(скільки|як|чи|які|яка|який|де|коли|чому|що\s+по|на\s+що|покажи|підкажи|проаналізуй|статистика|звіт|топ|порадь|допоможи|розкажи|порівняй|перевір|на\s+скільки|яка\s+сума)/i.test(
      t
    );
  if (startsWithInquiry) {
    return true;
  }

  // В. Аналітичні фінансові патерни
  const hasAnalyticalPattern =
    /(?:витрат(?:и|а|ів|ами)?\s+(?:на|за|цього|минулого|останн)|найбільш(?:і|а|их|у|е)|покуп(?:ок|ки|ками)|в\s+подуш(?:ку|ці|ка)|скарбнич(?:к|ц)[а-яіїєґ]*|підписк(?:и|ок|ами)|бюджет(?:у|ом)?|вистач(?:ить|ає)|оптиміз(?:увати|ація)|економі(?:я|ти)|заощад(?:ити|ження)|грош(?:і|ей|ами))/i.test(
      t
    );

  return hasAnalyticalPattern;
}
