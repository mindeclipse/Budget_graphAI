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
        .map((s) => {
          const curr =
            s.currency === "USD" ? "$" : s.currency === "EUR" ? "€" : "₴";
          return `  • ${s.title}: ${Number(s.amount).toLocaleString("uk-UA")} ${curr} (через ${s.daysRemaining} дн)`;
        })
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
1. МОВА ВІДПОВІДІ: СУВОРО ТА ВИКЛЮЧНО УКРАЇНСЬКА МОВА. Навіть якщо назви мерчантів, підписок чи категорій вказані латиницею або англійською (наприклад Spotify, Netflix, Apple), твоя відповідь має бути на 100% українською мовою. Жодного речення, фрази чи вигуку англійською.
2. ФОРМАТУВАННЯ ТА ЛАКОНІЧНІСТЬ: Відповідай чітко, структуровано, по суті поставленого запитання. Без зайвої «води», банальних вступів та повчань. Твої відповіді мають бути завершеними думками, які легко читати з екрана смартфона.
3. ТОЧНІСТЬ РОЗРАХУНКІВ: Завжди оперуй реальними цифрами з контексту. Валюта за замовчуванням — ₴ (гривня).
4. ВІДПОВІДІ НА ТИПОВІ ЗАПИТАННЯ КОРИСТУВАЧА:
   - Якщо питають: «Чи вкладаюсь я в бюджет?»: проаналізуй фактичний залишок (${financialContext.remaining} ₴) відносно кількості днів (${financialContext.daysRemaining} дн) та денного ліміту (${financialContext.safeDailySpend} ₴/день). Якщо залишок позитивний і темп нормальний, запевни користувача, що все під контролем, а регулярні підписки враховані. Не панікуй безпідставно і не вигадуй "red flags" для звичайних планових витрат!
   - Якщо питають: «Скільки можу витратити на вихідних?»: порахуй ліміт суворо на 2 дні вихідних: ${Number(Number(financialContext.safeDailySpend || 0) * 2).toLocaleString("uk-UA")} ₴ (з розрахунку ${financialContext.safeDailySpend} ₴/день), нагадавши, що це збереже темп до кінця циклу.
   - Якщо питають: «Як оптимізувати найбільшу категорію?» або про конкретну категорію: візьми цю категорію з топу витрат (${financialContext.topCategories?.[0]?.name || "найбільша категорія"}) і дай 2-3 практичні, реалістичні поради щодо оптимізації саме цієї статті без стресу.
   - Якщо питають: «Як дожити до кінця циклу без дефіциту?»: наголоси на дотриманні щоденного безпечного ліміту (${financialContext.safeDailySpend} ₴/день), порекомендуй тимчасово призупинити необов'язкові витрати з категорій «Кафе», «Розваги» чи «Покупки» та зосередитися на базових потребах до кінця періоду (${financialContext.daysRemaining} дн).
   - Якщо питають: «Чи вистачить коштів на [Підписка]?»: порівняй суму підписки з фактичним залишком (${financialContext.remaining} ₴). Якщо залишок більший, заспокій користувача, що платіж надійно покривається.
   - Якщо питають: «Чи можу дозволити покупку з вішліста?»: зістав відкладену суму (${financialContext.wishlistPendingAmount || 0} ₴) із залишком (${financialContext.remaining} ₴) та безпечним денним лімітом, пояснивши, як це вплине на фінансову подушку до кінця циклу.
   - Якщо питають: «Чи можу я дозволити собі покупку на X ₴?»: детально порахуй вплив покупки на залишок (${financialContext.remaining} ₴) та новий безпечний денний ліміт. Якщо покупка суттєва, нагадай про можливість відкласти її в «Лист очікування (Анти-імпульс)» на 7–14 днів.
5. Не вигадуй фактів, транзакцій чи небезпек, яких немає в контексті.
6. Користувач у будні дні працює віддалено з дому до 17:00. Будь-які покупки після 17:00 (продукти, вечеря, аптека, побут) є природними та плановими потребами забезпечення життя, а НЕ емоційною «сліпою зоною».
7. Уважно аналізуй коментарі та теги до операцій (#подарунок, #авто, планове лікування тощо). Вони відображають життєвий контекст. Враховуй його, щоб розуміти справжні мотиви витрат і не називати цільові або планові витрати імпульсивними чи випадковими.
`;

    // 3. Форматування та санітизація історії повідомлень для Gemini API
    const sanitizedMessages = messages
      .filter(
        (m) => m && typeof m.content === "string" && m.content.trim().length > 0
      )
      .map((m) => ({
        role: m.role === "assistant" ? ("model" as const) : ("user" as const),
        parts: [{ text: m.content.trim() }],
      }));

    if (sanitizedMessages.length === 0) {
      return NextResponse.json(
        { error: "Потрібно надати хоча б одне валідне повідомлення" },
        { status: 400 }
      );
    }

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
        const config: Record<string, any> = {
          systemInstruction,
          maxOutputTokens: 4096,
        };

        // Для моделей flash з підтримкою thinking (gemini-3.5-flash, gemini-3.7-flash)
        // вимикаємо thinkingBudget, щоб уникнути з'їдання вихідних токенів та затримок генерації.
        // Модель flash-lite не підтримує thinkingConfig (повертає 400), тому для неї поле не передається.
        if (!currentModel.includes("lite")) {
          config.thinkingConfig = {
            thinkingBudget: 0,
          };
        }

        const response = await ai.models.generateContent({
          model: currentModel,
          contents: sanitizedMessages,
          config,
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
