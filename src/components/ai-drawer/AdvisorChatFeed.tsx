"use client";

import React, { RefObject } from "react";
import { MessageSquare, Bot, User, RefreshCw } from "lucide-react";
import { ChatMessage } from "@/types/ai";

interface AdvisorChatFeedProps {
  messages: ChatMessage[];
  isSendingChat: boolean;
  chatEndRef: RefObject<HTMLDivElement | null>;
  quickQuestions: string[];
  onSelectQuickQuestion: (question: string) => void;
}

export function AdvisorChatFeed({
  messages,
  isSendingChat,
  chatEndRef,
  quickQuestions,
  onSelectQuickQuestion,
}: AdvisorChatFeedProps) {
  return (
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
              Привіт! Я проаналізував твій фінансовий цикл. Запитай мене, чи
              вкладаєшся ти в бюджет, чи можна зробити велику покупку, або як
              оптимізувати витрати.
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
            onClick={() => onSelectQuickQuestion(q)}
            disabled={isSendingChat}
            className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-2 py-1 text-[11px] text-zinc-300 transition-all hover:border-purple-500/30 hover:bg-purple-950/30 hover:text-purple-200 disabled:opacity-40"
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}
