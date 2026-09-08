import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      month,
      budgetLimit,
      totalSpent,
      remaining,
      daysRemaining,
      safeDailySpend,
      categories,
      recurringTotal,
      topTransactions,
    } = body;

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY не налаштовано на сервері" },
        { status: 500 }
      );
    }

    const prompt = `Ти — персональний аналітичний фінансовий асистент. Твоя мета — оцінити поточну структуру витрат користувача, розрахувати ризик виходу за межі бюджету та дати конкретні, раціональні поради щодо заощадження.

Контекст за період (${month}):
- Встановлений місячний ліміт: ${budgetLimit} ₴
- Фактично витрачено: ${totalSpent} ₴
- Залишок бюджету: ${remaining} ₴
- Днів до кінця місяця: ${daysRemaining}
- Поточний безпечний темп на день: ${Number(safeDailySpend).toFixed(0)} ₴/день
- Заплановані постійні витрати на місяць: ${recurringTotal} ₴
- Розподіл за категоріями: ${JSON.stringify(categories)}
- Найбільші транзакції: ${JSON.stringify(topTransactions)}

Вимоги до відповіді:
1. Поверни виключно валідний JSON без markdown-обгорток (\`\`\`json).
2. Формат JSON:
{
  "status": "safe" | "warning" | "danger",
  "summary": "Короткий висновок (1-2 речення) щодо темпу витрат.",
  "anomalies": ["Помічена аномалія 1", "Помічена аномалія 2"],
  "saving_tactics": [
    "Конкретна дія для економії 1",
    "Конкретна дія для економії 2",
    "Конкретна дія для економії 3"
  ],
  "forecast": "Сценарний розрахунок до кінця місяця при збереженні темпу."
}`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: "application/json",
          },
        }),
      }
    );

    if (!response.ok) {
      const err = await response.text();
      return NextResponse.json(
        { error: "Помилка Gemini API", details: err },
        { status: response.status }
      );
    }

    const data = await response.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    const parsedInsight = JSON.parse(rawText);

    return NextResponse.json(parsedInsight);
  } catch (error: any) {
    return NextResponse.json(
      { error: "Помилка обробки", message: error?.message },
      { status: 500 }
    );
  }
}