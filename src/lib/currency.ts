interface PrivatExchangeRate {
  ccy: string; // Валюта угоди (USD, EUR)
  base_ccy: string; // Базова валюта (UAH)
  buy: string;
  sale: string; // Курс продажу банком (фактичний курс списання з картки)
}

export async function getUsdRate(): Promise<number> {
  try {
    const res = await fetch(
      "https://api.privatbank.ua/p24api/pubinfo?json&exchange&coursid=11",
      { next: { revalidate: 3600 } } // Кешування на 1 годину
    );

    if (!res.ok) throw new Error("Failed to fetch PrivatBank exchange rate");

    const data: PrivatExchangeRate[] = await res.json();
    const usdItem = data.find((item) => item.ccy === "USD");

    if (!usdItem || !usdItem.sale) {
      throw new Error("USD rate not found in PrivatBank response");
    }

    return parseFloat(usdItem.sale);
  } catch (error) {
    console.error("Error fetching USD exchange rate from PrivatBank:", error);
    // Fallback: якщо API банку тимчасово недоступне, підтягуємо безпечний орієнтир
    return 41.8;
  }
}
