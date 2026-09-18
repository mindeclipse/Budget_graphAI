"use client";

import React, { useState, useEffect, useRef } from "react";
import { X, Sparkles } from "lucide-react";
import { ChatMessage } from "@/types/ai";
import {
  AIAnalysisDrawerProps,
  ModelSelector,
  AnalysisReportBody,
  AdvisorChatFeed,
  AdvisorChatInput,
} from "./ai-drawer";

export type { AIAnalysisDrawerProps } from "./ai-drawer";

const QUICK_QUESTIONS = [
  "Чи вкладаюсь я в бюджет?",
  "Скільки можу витратити на вихідних?",
  "Як оптимізувати найбільшу категорію?",
];

export function AIAnalysisDrawer({
  isOpen,
  onClose,
  analysis,
  isLoading,
  selectedModel,
  onModelChange,
  onReanalyze: _onReanalyze,
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
    } catch {
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

  // Якщо передано initialPrompt (наприклад з картки або чіпсу) — автоматично відправляємо його
  useEffect(() => {
    if (isOpen && initialPrompt && initialPrompt.trim()) {
      handleSendMessage(initialPrompt.trim());
    }
  }, [isOpen, initialPrompt]);

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSendMessage(chatInput);
  };

  if (!isOpen) return null;

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

        {/* 2. Селектор моделей */}
        <ModelSelector
          selectedModel={selectedModel}
          onModelChange={onModelChange}
        />

        {/* 3. Скрол-зона: Аналітичний звіт + Follow-up чат */}
        <div className="flex-1 [scrollbar-width:thin] space-y-3.5 overflow-y-auto overscroll-contain pr-1">
          <AnalysisReportBody
            isLoading={isLoading}
            analysis={analysis}
            selectedModel={selectedModel}
          />

          <AdvisorChatFeed
            messages={messages}
            isSendingChat={isSendingChat}
            chatEndRef={chatEndRef}
            quickQuestions={QUICK_QUESTIONS}
            onSelectQuickQuestion={handleSendMessage}
          />
        </div>

        {/* 4. Нижня форма відправки повідомлень у чат */}
        <AdvisorChatInput
          chatInput={chatInput}
          isSendingChat={isSendingChat}
          onInputChange={setChatInput}
          onSubmit={handleFormSubmit}
        />
      </div>
    </div>
  );
}
