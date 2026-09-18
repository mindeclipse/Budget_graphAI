"use client";

import React from "react";
import { Send } from "lucide-react";

interface AdvisorChatInputProps {
  chatInput: string;
  isSendingChat: boolean;
  onInputChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
}

export function AdvisorChatInput({
  chatInput,
  isSendingChat,
  onInputChange,
  onSubmit,
}: AdvisorChatInputProps) {
  return (
    <div className="mt-3 border-t border-zinc-800/80 pt-3">
      <form onSubmit={onSubmit} className="flex items-center gap-2">
        <input
          type="text"
          value={chatInput}
          onChange={(e) => onInputChange(e.target.value)}
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
  );
}
