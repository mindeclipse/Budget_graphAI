"use client";

import React from "react";
import { Lock, Fingerprint } from "lucide-react";
import { triggerHaptic } from "@/lib/haptics";

interface PinAuthScreenProps {
  isLoading: boolean;
  pinInput: string;
  onPinChange: (value: string) => void;
  pinError: string;
  isVerifyingPin: boolean;
  onLogin: (e: React.FormEvent) => void;
  onBiometricLogin: () => void;
  isBiometricSupported?: boolean;
}

export function PinAuthScreen({
  isLoading,
  pinInput,
  onPinChange,
  pinError,
  isVerifyingPin,
  onLogin,
  onBiometricLogin,
  isBiometricSupported = true,
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
      <div className="w-full max-w-xs space-y-5 rounded-3xl border border-zinc-900 bg-zinc-950 p-6 text-center shadow-2xl">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-900 text-zinc-400">
          <Lock size={20} />
        </div>
        <div>
          <h2 className="text-base font-bold text-white">Вхід до фінансів</h2>
          <p className="mt-1 text-xs text-zinc-500">
            {isBiometricSupported
              ? "Touch ID / Face ID або PIN-код"
              : "Введіть PIN-код доступу"}
          </p>
        </div>

        {/* Головна дія (Primary Action): швидкий біометричний вхід */}
        {isBiometricSupported && (
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => {
                triggerHaptic("medium");
                onBiometricLogin();
              }}
              disabled={isVerifyingPin}
              className="group flex w-full items-center justify-center gap-2.5 rounded-2xl border border-sky-500/30 bg-sky-500/10 py-3.5 text-xs font-semibold text-sky-400 transition-all hover:border-sky-500/50 hover:bg-sky-500/20 active:scale-[0.98] disabled:opacity-40"
              title="Швидкий вхід за допомогою Face ID / Touch ID"
            >
              <Fingerprint
                size={18}
                className="transition-transform group-hover:scale-110"
              />
              <span>
                {isVerifyingPin
                  ? "Перевірка..."
                  : "Увійти через Face ID / Touch ID"}
              </span>
            </button>

            <div className="flex items-center gap-2.5 pt-1">
              <div className="h-px flex-1 bg-zinc-800/80" />
              <span className="text-[10px] font-medium tracking-wider text-zinc-500 uppercase">
                або PIN-код
              </span>
              <div className="h-px flex-1 bg-zinc-800/80" />
            </div>
          </div>
        )}

        {/* Форма введення PIN-коду (без нав'язливого autoFocus на мобільних) */}
        <form onSubmit={onLogin} className="space-y-3.5">
          <input
            type="password"
            inputMode="numeric"
            maxLength={12}
            value={pinInput}
            onChange={(e) => {
              triggerHaptic("light");
              onPinChange(e.target.value);
            }}
            placeholder="••••••••••••"
            className="w-full rounded-2xl border border-zinc-800 bg-zinc-900 py-2.5 text-center font-mono text-lg tracking-[0.3em] text-white placeholder-zinc-600 transition-all focus:border-zinc-600 focus:outline-none"
          />

          {pinError && (
            <p className="text-xs font-medium text-rose-400">{pinError}</p>
          )}

          <button
            type="submit"
            disabled={isVerifyingPin || !pinInput}
            className="w-full rounded-2xl bg-zinc-800 py-2.5 text-xs font-semibold text-zinc-200 transition-all hover:bg-zinc-700 hover:text-white active:scale-[0.98] disabled:opacity-40"
          >
            {isVerifyingPin ? "Перевірка..." : "Розблокувати за PIN"}
          </button>
        </form>
      </div>
    </main>
  );
}
