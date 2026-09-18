export interface FastMatchResult {
  cleanTitle: string;
  categoryName: string;
}

/**
 * Ешелон 0: Миттєве евристичне розпізнавання популярних українських мерчантів (0 мс).
 * Повністю усуває таймаути Apple Shortcuts ("Час на запит сплив") при слабкому покритті зв'язку.
 */
export function getFastMerchantMatch(
  rawMerchant: string,
  cleaned: string
): FastMatchResult | null {
  const text = `${rawMerchant} ${cleaned}`.toLowerCase();

  // 1. Доставка та пошта
  if (/укрпошт|ukrposht/i.test(text)) {
    return { cleanTitle: "Укрпошта", categoryName: "Доставка" };
  }
  if (
    /нова.?пошт|nova.?posht|poshtomat|поштомат|np.?lviv|np.?kyiv/i.test(text)
  ) {
    return { cleanTitle: "Нова Пошта", categoryName: "Доставка" };
  }
  if (/meest|міст.?пошт/i.test(text)) {
    return { cleanTitle: "Meest Пошта", categoryName: "Доставка" };
  }

  // 2. Здоров'я та догляд (аптеки, косметика, клініки)
  if (/подорожник|podorozhnyk/i.test(text)) {
    return {
      cleanTitle: "Аптека Подорожник",
      categoryName: "Здоров'я та догляд",
    };
  }
  if (/аптек|apteka|знахар|бажаємо здоров|анц|anc|farm|фарм/i.test(text)) {
    return { cleanTitle: "Аптека", categoryName: "Здоров'я та догляд" };
  }
  if (/eva|єва|watsons|ватсонс|prostor|простор/i.test(text)) {
    return { cleanTitle: "EVA", categoryName: "Здоров'я та догляд" };
  }

  // 3. Супермаркети та їжа
  if (/атб|atb/i.test(text)) {
    return { cleanTitle: "АТБ", categoryName: "Продукти" };
  }
  if (/сільпо|silpo/i.test(text)) {
    return { cleanTitle: "Сільпо", categoryName: "Продукти" };
  }
  if (/близенько|blyzenko/i.test(text)) {
    return { cleanTitle: "Близенько", categoryName: "Продукти" };
  }
  if (/рукавичка|rukavychka/i.test(text)) {
    return { cleanTitle: "Рукавичка", categoryName: "Продукти" };
  }
  if (/сім.?23|simi/i.test(text)) {
    return { cleanTitle: "Сім23", categoryName: "Продукти" };
  }
  if (/ашан|auchan|metro|метро|варус|varus|фора|fora/i.test(text)) {
    return { cleanTitle: cleaned || "Супермаркет", categoryName: "Продукти" };
  }

  // 4. Тютюн
  if (/овація|ovatsiya|ovaciya/i.test(text)) {
    return { cleanTitle: "Овація", categoryName: "Куріння" };
  }
  if (/табакерка|tabakerka|сигарний дім/i.test(text)) {
    return { cleanTitle: "Табакерка", categoryName: "Куріння" };
  }

  // 5. Транспорт та таксі
  if (/uklon|уклон/i.test(text)) {
    return { cleanTitle: "Таксі Uklon", categoryName: "Транспорт" };
  }
  if (/bolt/i.test(text) && !/food/i.test(text)) {
    return { cleanTitle: "Таксі Bolt", categoryName: "Транспорт" };
  }

  // 6. АЗС
  if (/okko|окко/i.test(text)) {
    return { cleanTitle: "АЗС OKKO", categoryName: "Авто" };
  }
  if (/wog|вог/i.test(text)) {
    return { cleanTitle: "АЗС WOG", categoryName: "Авто" };
  }
  if (/socar|сокар/i.test(text)) {
    return { cleanTitle: "АЗС Socar", categoryName: "Авто" };
  }

  // 7. Кафе та ресторани
  if (/dk shevchenka|dk.?kebab/i.test(text)) {
    return { cleanTitle: "Кебаб", categoryName: "Кафе та ресторани" };
  }
  if (/mcdonald|макдональд/i.test(text)) {
    return { cleanTitle: "McDonald's", categoryName: "Кафе та ресторани" };
  }
  if (/kfc|кфс/i.test(text)) {
    return { cleanTitle: "KFC", categoryName: "Кафе та ресторани" };
  }

  return null;
}
