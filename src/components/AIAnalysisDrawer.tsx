"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  X,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  AlertOctagon,
  RefreshCw,
  MessageSquare,
  Send,
  Bot,
  User,
  Zap,
} from "lucide-react";
import {
  AIAnalysisResponse,
  SupportedGeminiModel,
  ChatMessage,
  AIChatFinancialContext,
} from "@/types/ai";

interface AIAnalysisDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  analysis: AIAnalysisResponse | null;
  isLoading: boolean;
  selectedModel: SupportedGeminiModel;
  onModelChange: (model: SupportedGeminiModel) => void;
  onReanalyze: () => void;
  initialPrompt?: string;
  financialContext: AIChatFinancialContext;
}

export function AIAnalysisDrawer({
  isOpen,
  onClose,
  analysis,
  isLoading,
  selectedModel,
  onModelChange,
  onReanalyze,
  initialPrompt,
  financialContext,
}: AIAnalysisDrawerProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isSendingChat, setIsSendingChat] = useState(false);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  // Клавіша Escape для закриття
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "unset";
    };
  }, [isOpen, onClose]);

  // Плавний скрол до останнього повідомлення в чаті
  useEffect(() => {
    if (isOpen) {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isOpen, isSendingChat]);

  // Якщо передано initialPrompt (наприклад з картки або чіпсу) — автоматично відправляємо його
  useEffect(() => {
    if (isOpen && initialPrompt && initialPrompt.trim()) {
      handleSendMessage(initialPrompt.trim());
    }
  }, [isOpen, initialPrompt]);

  const handleSendMessage = async (textToSend: string) => {
    if (!textToSend.trim() || isSendingChat) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: textToSend.trim(),
      createdAt: new Date().toISOString(),
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setChatInput("");
    setIsSendingChat(true);

    try {
      const payload = {
        messages: newMessages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        financialContext: {
          ...financialContext,
          analysisSummary: analysis?.summary,
        },
        preferredModel: selectedModel,
      };

      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error("Не вдалося отримати відповідь від асистента");
      }

      const data = await res.json();
      const botMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: data.reply,
        createdAt: new Date().toISOString(),
        usedModel: data.usedModel,
      };

      setMessages((prev) => [...prev, botMessage]);
    } catch (err: any) {
      const errorMessage: ChatMessage = {
        id: `error-${Date.now()}`,
        role: "assistant",
        content:
          "Вибачте, виникла тимчасова затримка зв'язку з моделлю. Спробуйте ще раз через кілька секунд.",
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsSendingChat(false);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSendMessage(chatInput);
  };

  if (!isOpen) return null;

  const statusConfig = {
    on_track: {
      label: "У межах норми",
      icon: CheckCircle2,
      badge: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
    },
    warning: {
      label: "Підвищений темп",
      icon: AlertTriangle,
      badge: "border-amber-500/30 bg-amber-500/10 text-amber-400",
    },
    critical: {
      label: "Ризик перевитрати",
      icon: AlertOctagon,
      badge: "border-rose-500/30 bg-rose-500/10 text-rose-400",
    },
  };

  const currentStatus = analysis
    ? statusConfig[analysis.status]
    : statusConfig.on_track;
  const StatusIcon = currentStatus.icon;

  const quickQuestions = [
    "Чи вкладаюсь я в бюджет?",
    "Скільки можу витратити на вихідних?",
    "Як оптимізувати найбільшу категорію?",
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      {/* Клік по підкладці закриває шторку */}
      <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />

      {/* Адаптивна шторка для iPhone / Центрована картка для десктопу */}
      <div className="relative z-10 flex max-h-[92vh] w-full max-w-2xl flex-col overscroll-contain rounded-t-[28px] border border-zinc-800 bg-zinc-950 p-5 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-2xl sm:max-h-[88vh] sm:rounded-3xl sm:p-6 sm:pb-5">
        {/* Grabber Bar для iOS */}
        <div className="mx-auto mb-3 h-1.5 w-11 shrink-0 rounded-full bg-zinc-700/50 sm:hidden" />

        {/* 1. Заголовок та закриття */}
        <div className="mb-3.5 flex items-center justify-between border-b border-zinc-800/80 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-purple-500/30 bg-purple-500/10 text-purple-400 shadow-[0_0_12px_rgba(168,85,247,0.15)]">
              <Sparkles size={16} />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                AI Фінансовий аналітик & Радник
              </h2>
              <span className="text-[11px] text-zinc-400">
                Контекстний аналіз витрат та живий діалог
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900/60 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white active:scale-95"
          >
            <X size={16} />
          </button>
        </div>

        {/* 2. Селектор моделей з індикатором відмовостійкості */}
        <div className="mb-3 flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/50 p-1.5">
          <div className="flex items-center gap-1.5 pl-2 text-[11px] font-medium text-zinc-400">
            <Zap size={12} className="text-purple-400" />
            <span>Модель Gemini:</span>
          </div>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => onModelChange("gemini-3.5-flash")}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-all ${
                selectedModel === "gemini-3.5-flash"
                  ? "border border-purple-500/30 bg-zinc-800 text-purple-300 shadow-xs"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              3.5 Flash
            </button>
            <button
              type="button"
              onClick={() => onModelChange("gemini-3.7-flash")}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-all ${
                selectedModel === "gemini-3.7-flash"
                  ? "border border-purple-500/30 bg-zinc-800 text-purple-300 shadow-xs"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              3.7 Flash
            </button>
            <button
              type="button"
              onClick={() => onModelChange("gemini-3.5-flash-lite")}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-all ${
                selectedModel === "gemini-3.5-flash-lite"
                  ? "border border-purple-500/30 bg-zinc-800 text-purple-300 shadow-xs"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              Lite
            </button>
          </div>
        </div>

        {/* 3. Скрол-зона: Аналітичний звіт + Follow-up чат */}
        <div className="flex-1 [scrollbar-width:thin] space-y-3.5 overflow-y-auto overscroll-contain pr-1">
          {/* Стан первинного завантаження */}
          {isLoading && (
            <div className="flex flex-col items-center justify-center py-12 text-zinc-400">
              <RefreshCw
                size={24}
                className="mb-3 animate-spin text-purple-400"
              />
              <p className="text-xs text-zinc-400">
                Формування фінансового звіту через {selectedModel}...
              </p>
            </div>
          )}

          {/* Тіло аналітичного звіту */}
          {!isLoading && analysis && (
            <>
              {/* Статус і резюме */}
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-3.5">
                <div className="mb-2 flex items-center justify-between">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${currentStatus.badge}`}
                  >
                    <StatusIcon size={12} />
                    {currentStatus.label}
                  </span>
                  <span className="font-mono text-[10px] text-zinc-500">
                    модель: {analysis.usedModel}
                  </span>
                </div>
                <p className="text-xs leading-relaxed text-zinc-300">
                  {analysis.summary}
                </p>
              </div>

              {/* Метрики темпу */}
              <div className="grid grid-cols-2 gap-2.5">
                <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-3">
                  <div className="text-[10px] font-medium text-zinc-500 uppercase">
                    Прогноз залишку
                  </div>
                  <div
                    className={`mt-1 font-mono text-sm font-bold tabular-nums ${
                      analysis.paceAnalysis.projectedEndBalance >= 0
                        ? "text-emerald-400"
                        : "text-rose-400"
                    }`}
                  >
                    {analysis.paceAnalysis.projectedEndBalance > 0 ? "+" : ""}
                    {analysis.paceAnalysis.projectedEndBalance.toLocaleString(
                      "uk-UA"
                    )}{" "}
                    ₴
                  </div>
                </div>

                <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-3">
                  <div className="text-[10px] font-medium text-zinc-500 uppercase">
                    Рекомендовано на день
                  </div>
                  <div className="mt-1 font-mono text-sm font-bold text-zinc-200 tabular-nums">
                    ~
                    {analysis.paceAnalysis.adjustedDailyBudget.toLocaleString(
                      "uk-UA"
                    )}{" "}
                    ₴/дн
                  </div>
                </div>
              </div>

              {/* Спостереження та план дій */}
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-3">
                  <div className="mb-1.5 text-[10px] font-semibold tracking-wide text-zinc-400 uppercase">
                    Ключові факти
                  </div>
                  <ul className="space-y-1.5 text-[11px] text-zinc-300">
                    {analysis.keyFindings.map((item, idx) => (
                      <li key={idx} className="flex items-start gap-1.5">
                        <span className="text-purple-400">•</span>
                        <span className="leading-snug">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-3">
                  <div className="mb-1.5 text-[10px] font-semibold tracking-wide text-zinc-400 uppercase">
                    План дій
                  </div>
                  <ul className="space-y-1.5 text-[11px] text-zinc-300">
                    {analysis.actionableSteps.map((step, idx) => (
                      <li key={idx} className="flex items-start gap-1.5">
                        <span className="font-mono text-[10px] font-bold text-purple-400">
                          {idx + 1}.
                        </span>
                        <span className="leading-snug">{step}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </>
          )}

          {/* 4. Секція інтерактивного Follow-up чату */}
          <div className="rounded-2xl border border-purple-900/30 bg-purple-950/10 p-3.5">
            <div className="mb-2.5 flex items-center justify-between border-b border-purple-900/20 pb-2">
              <div className="flex items-center gap-1.5">
                <MessageSquare size={13} className="text-purple-400" />
                <span className="text-xs font-bold tracking-wide text-zinc-200 uppercase">
                  Живий діалог з радником
                </span>
              </div>
              <span className="rounded-full bg-purple-500/10 px-2 py-0.5 text-[10px] font-medium text-purple-300">
                Запитай про будь-яку покупку
              </span>
            </div>

            {/* Стрічка повідомлень */}
            <div className="space-y-2.5">
              {messages.length === 0 ? (
                <div className="flex items-start gap-2 rounded-xl bg-zinc-900/40 p-2.5 text-xs text-zinc-400">
                  <Bot size={15} className="mt-0.5 shrink-0 text-purple-400" />
                  <p className="leading-relaxed">
                    Привіт! Я проаналізував твій фінансовий цикл. Запитай мене,
                    чи вкладаєшся ти в бюджет, чи можна зробити велику покупку,
                    або як оптимізувати витрати.
                  </p>
                </div>
              ) : (
                messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex items-start gap-2 ${
                      msg.role === "user" ? "justify-end" : "justify-start"
                    }`}
                  >
                    {msg.role === "assistant" && (
                      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-purple-500/30 bg-purple-500/10 text-purple-400">
                        <Bot size={13} />
                      </div>
                    )}

                    <div
                      className={`max-w-[85%] rounded-2xl p-3 text-xs leading-relaxed ${
                        msg.role === "user"
                          ? "bg-purple-600 text-white"
                          : "border border-zinc-800 bg-zinc-900/80 text-zinc-200"
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                      {msg.usedModel && (
                        <p className="mt-1 text-right font-mono text-[9px] text-zinc-500">
                          {msg.usedModel}
                        </p>
                      )}
                    </div>

                    {msg.role === "user" && (
                      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-zinc-300">
                        <User size={13} />
                      </div>
                    )}
                  </div>
                ))
              )}

              {/* Індикатор генерації відповіді */}
              {isSendingChat && (
                <div className="flex items-center gap-2 py-1 text-xs text-purple-400">
                  <RefreshCw size={13} className="animate-spin" />
                  <span>Радник аналізує бюджет і формує відповідь...</span>
                </div>
              )}

              <div ref={chatEndRef} />
            </div>

            {/* Швидкі чіпси всередині чату */}
            <div className="mt-3 flex flex-wrap gap-1.5 border-t border-purple-900/20 pt-2.5">
              {quickQuestions.map((q, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSendMessage(q)}
                  disabled={isSendingChat}
                  className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-2 py-1 text-[11px] text-zinc-300 transition-all hover:border-purple-500/30 hover:bg-purple-950/30 hover:text-purple-200 disabled:opacity-40"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 5. Нижня форма відправки повідомлень у чат */}
        <div className="mt-3 border-t border-zinc-800/80 pt-3">
          <form onSubmit={handleFormSubmit} className="flex items-center gap-2">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Напишіть запитання до фінансового радника..."
              disabled={isSendingChat}
              className="flex-1 rounded-xl border border-zinc-800 bg-zinc-900 px-3.5 py-2.5 text-xs text-zinc-200 placeholder-zinc-500 focus:border-purple-500 focus:outline-none disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!chatInput.trim() || isSendingChat}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-purple-600 text-white transition-all hover:bg-purple-500 disabled:opacity-40"
            >
              <Send size={14} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
