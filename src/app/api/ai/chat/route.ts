import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySessionToken } from "@/lib/session";
import {
  getGeminiClient,
  GEMINI_FALLBACK_CHAIN,
  GEMINI_MODELS,
} from "@/lib/gemini";
import {
  AIChatRequest,
  AIChatResponse,
  SupportedGeminiModel,
} from "@/types/ai";

import { checkAiRateLimit } from "@/lib/rate-limiter";
import { getClientIp } from "@/lib/security";

export async function POST(req: NextRequest) {
  try {
    // 1. Zero-Trust перевірка сесії користувача
    const cookieStore = await cookies();
    const session = cookieStore.get("finance_session")?.value;
    const { valid } = await verifySessionToken(session);

    if (!valid) {
      return NextResponse.json(
        { error: "Доступ заборонено: відсутня активна сесія" },
        { status: 401 }
      );
    }

    // 2. Захист квоти Gemini API від надмірних повідомлень (Rate Limiting: макс. 25 / хв)
    const ip = getClientIp(req.headers);
    const rateLimit = checkAiRateLimit(`ai_chat_${ip}`, 25, 60 * 1000);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: `Забагато повідомлень. Будь ласка, зачекайте ${rateLimit.retryAfterSeconds} с.`,
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(rateLimit.retryAfterSeconds),
          },
        }
      );
    }

    const payload: AIChatRequest = await req.json();
    const { messages, financialContext, preferredModel } = payload;

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: "Потрібно надати хоча б одне повідомлення" },
        { status: 400 }
      );
    }

    const ai = getGeminiClient();

    // 2. Формування вичерпної системної інструкції фінансового коуча
    const systemInstruction = `
Ти — персональний фінансовий аналітик та радник для українського користувача у додатку керування особистим бюджетом.
Твоя мета — допомагати користувачеві раціонально розпоряджатися грошима, відповідати на запитання щодо його витрат, оцінювати можливість нових покупок та пропонувати дієві стратегії заощадження.

Актуальний фінансовий стан користувача:
- Розрахунковий період: ${financialContext.cycleName || "Поточний цикл"}
- Загальний ліміт бюджету: ${Number(financialContext.budgetLimit || 0).toLocaleString("uk-UA")} ₴
- Фактично витрачено: ${Number(financialContext.totalSpent || 0).toLocaleString("uk-UA")} ₴
- Фактичний залишок: ${Number(financialContext.remaining || 0).toLocaleString("uk-UA")} ₴
- Залишилося днів до кінця циклу: ${financialContext.daysRemaining ?? 0}
- Поточний безпечний денний ліміт: ${Number(financialContext.safeDailySpend || 0).toLocaleString("uk-UA")} ₴/день
- Топ категорій витрат:
${(financialContext.topCategories || []).map((c) => `  • ${c.name}: ${Number(c.amount).toLocaleString("uk-UA")} ₴ (${c.percentage}%)`).join("\n")}
${financialContext.analysisSummary ? `- Базовий висновок аналітика: "${financialContext.analysisSummary}"` : ""}
${
  financialContext.upcomingSubscriptions &&
  financialContext.upcomingSubscriptions.length > 0
    ? `- Найближчі обов'язкові платежі та підписки:\n` +
      financialContext.upcomingSubscriptions
        .map(
          (s) =>
            `  • ${s.title}: ${Number(s.amount).toLocaleString("uk-UA")} ₴ (через ${s.daysRemaining} дн)`
        )
        .join("\n")
    : ""
}
${
  financialContext.savedImpulseAmount !== undefined ||
  financialContext.wishlistCount !== undefined
    ? `- Усвідомлені фінанси (Лист очікування & Анти-імпульс):\n` +
      `  • Врятовано від імпульсивних покупок: ${Number(financialContext.savedImpulseAmount || 0).toLocaleString("uk-UA")} ₴\n` +
      `  • На охолодженні/паузі: ${financialContext.wishlistCount || 0} товарів на суму ${Number(financialContext.wishlistPendingAmount || 0).toLocaleString("uk-UA")} ₴`
    : ""
}
${
  financialContext.costPerUseCount !== undefined
    ? `- Окупність активів (Cost-per-Use):\n` +
      `  • Відстежується речей: ${financialContext.costPerUseCount}\n` +
      `  • Загальна економія на закладах/сервісах: +${Number(financialContext.costPerUseTotalSaved || 0).toLocaleString("uk-UA")} ₴`
    : ""
}
${
  financialContext.recentTransactions &&
  financialContext.recentTransactions.length > 0
    ? `- Останні та ключові операції періоду (з описом, коментарями та тегами):\n` +
      financialContext.recentTransactions
        .map((t) => {
          let s = `  • ${t.date}: ${t.merchant} — ${Number(t.amount).toLocaleString("uk-UA")} ₴ [${t.category}]`;
          if (t.isEmergency) s += ` (🛡️ Форс-мажор)`;
          if (t.tags && t.tags.length > 0)
            s += ` теги: ${t.tags.map((tg) => `#${tg}`).join(", ")}`;
          if (t.comment) s += ` коментар: "${t.comment}"`;
          return s;
        })
        .join("\n")
    : ""
}

Правила консультації:
1. Завжди спирайся на надані цифри. Відповідай українською мовою, структурно, лаконічно, ділово та дружньо.
2. Використовуй валюту ₴ (гривня).
3. Якщо користувач запитує: «Чи можу я дозволити собі покупку на X ₴?», детально порахуй це відносно залишку (${financialContext.remaining} ₴) та безпечного денного ліміту (${financialContext.safeDailySpend} ₴/день). Якщо сума велика, нагадай про можливість додати покупку в «Лист очікування (Анти-імпульс)» на 7–14 днів для перевірки справжньої потреби.
4. Якщо просять порад щодо оптимізації — звертай увагу на найбільші статті витрат, регулярні підписки або окупність куплених речей.
5. Не вигадуй фактів та транзакцій, яких немає в контексті.
6. Користувач у будні дні працює віддалено з дому до 17:00. Будь-які покупки після 17:00 (продукти, вечеря, аптека, побут) є природними та плановими потребами забезпечення життя, а НЕ емоційною «сліпою зоною».
7. Уважно аналізуй коментарі та теги до операцій. Вони відображають життєвий контекст (наприклад: #подарунок мамі, #авто ремонт, планове лікування, свята, благодійність). Якщо користувач залишив коментар або тег до транзакції, враховуй цей контекст, щоб розуміти справжні мотиви витрат і не називати цільові або планові витрати імпульсивними чи випадковими.
`;

    // 3. Форматування історії повідомлень для Gemini API (роль асистента конвертується в 'model')
    const contents = messages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    // 4. Безвідмовний мультимодельний Fallback-каскад (Zero Downtime)
    // Первинна: якісна gemini-3.5-flash. Фолбек: gemini-3.5-flash-lite (500 RPD) для захисту від переліміту
    const targetModel: SupportedGeminiModel =
      preferredModel || GEMINI_MODELS.BALANCED;
    const candidateModels: SupportedGeminiModel[] = [
      targetModel,
      ...GEMINI_FALLBACK_CHAIN.filter((m) => m !== targetModel),
    ];

    let replyText = "";
    let successfullyUsedModel: SupportedGeminiModel = targetModel;
    let fallbackOccurred = false;

    for (let i = 0; i < candidateModels.length; i++) {
      const currentModel = candidateModels[i];
      try {
        const response = await ai.models.generateContent({
          model: currentModel,
          contents,
          config: {
            systemInstruction,
            temperature: 0.4,
            maxOutputTokens: 1024,
          },
        });

        if (response.text) {
          replyText = response.text;
          successfullyUsedModel = currentModel;
          if (i > 0) {
            fallbackOccurred = true;
            console.log(
              `[AIChat] Fallback succeeded: used ${currentModel} instead of ${targetModel}`
            );
          }
          break;
        }
      } catch (err: any) {
        console.warn(
          `[AIChat] Model ${currentModel} failed (attempt ${i + 1}/${candidateModels.length}):`,
          err?.message || err
        );
      }
    }

    if (!replyText) {
      throw new Error(
        "Усі доступні моделі Gemini тимчасово недоступні. Будь ласка, спробуйте ще раз."
      );
    }

    const responsePayload: AIChatResponse = {
      reply: replyText,
      usedModel: successfullyUsedModel,
      modelFallbackOccurred: fallbackOccurred,
    };

    return NextResponse.json(responsePayload);
  } catch (error: any) {
    console.error("AI Chat API Error:", error);
    return NextResponse.json(
      { error: error?.message || "Помилка генерації відповіді в чаті" },
      { status: 500 }
    );
  }
}
