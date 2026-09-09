"use client";

import React from "react";
import { Lock, Fingerprint } from "lucide-react";

interface PinAuthScreenProps {
  isLoading: boolean;
  pinInput: string;
  onPinChange: (value: string) => void;
  pinError: string;
  isVerifyingPin: boolean;
  onLogin: (e: React.FormEvent) => void;
  onBiometricLogin: () => void;
}

export function PinAuthScreen({
  isLoading,
  pinInput,
  onPinChange,
  pinError,
  isVerifyingPin,
  onLogin,
  onBiometricLogin,
}: PinAuthScreenProps) {
  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-700 border-t-white" />
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-black p-4 text-white">
      <div className="w-full max-w-xs space-y-6 rounded-3xl border border-zinc-900 bg-zinc-950 p-6 text-center shadow-2xl">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-900 text-zinc-400">
          <Lock size={20} />
        </div>
        <div>
          <h2 className="text-base font-bold text-white">Вхід до фінансів</h2>
          <p className="mt-1 text-xs text-zinc-500">Введіть PIN-код доступу</p>
        </div>

        <form onSubmit={onLogin} className="space-y-4">
          <input
            type="password"
            inputMode="numeric"
            maxLength={12}
            value={pinInput}
            onChange={(e) => onPinChange(e.target.value)}
            placeholder="••••"
            autoFocus
            className="w-full rounded-2xl border border-zinc-800 bg-zinc-900 py-3 text-center font-mono text-xl tracking-[0.4em] text-white transition-all focus:border-zinc-600 focus:outline-none"
          />

          {pinError && (
            <p className="text-xs font-medium text-rose-400">{pinError}</p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onBiometricLogin}
              disabled={isVerifyingPin}
              className="flex items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-zinc-300 transition-all hover:border-zinc-700 hover:text-white disabled:opacity-40"
              title="Увійти за допомогою Face ID / Touch ID"
            >
              <Fingerprint size={18} />
            </button>
            <button
              type="submit"
              disabled={isVerifyingPin || !pinInput}
              className="flex-1 rounded-2xl bg-white py-3 text-xs font-bold text-black transition-all hover:bg-zinc-200 disabled:opacity-40"
            >
              {isVerifyingPin ? "Перевірка..." : "Розблокувати"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
