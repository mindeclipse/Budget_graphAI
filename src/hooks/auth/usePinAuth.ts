import { useState, useCallback } from "react";
import { triggerHaptic } from "@/lib/haptics";
import {
  setupOfflinePinVerifier,
  verifyOfflinePin,
  resetOfflinePinAttempts,
} from "@/lib/offline-pin";

interface UsePinAuthProps {
  onSuccess: () => void;
}

export function usePinAuth({ onSuccess }: UsePinAuthProps) {
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState("");
  const [isVerifyingPin, setIsVerifyingPin] = useState(false);

  // Вхід через PIN-код з прозорою підтримкою офлайн-розблокування (PBKDF2)
  const handleLogin = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setIsVerifyingPin(true);
      setPinError("");

      try {
        const currentlyOnline =
          typeof navigator !== "undefined" ? navigator.onLine : true;

        // 1. Спроба онлайнового входу через бекенд (якщо мережа доступна)
        if (currentlyOnline) {
          try {
            const res = await fetch("/api/auth", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ pin: pinInput }),
            });

            // Якщо статус 503 (offline fallback від Service Worker), переходимо до офлайн-перевірки
            if (res.status !== 503) {
              if (res.ok) {
                triggerHaptic("success");
                // Зберігаємо або освіжаємо локальний криптографічний верифікатор
                await setupOfflinePinVerifier(pinInput);
                resetOfflinePinAttempts();
                onSuccess();
                return;
              }

              if (res.status === 401) {
                triggerHaptic("error");
                const errData = await res.json().catch(() => null);
                setPinError(errData?.error || "Невірний PIN-код");
                setPinInput("");
                return;
              }

              if (res.status === 429) {
                triggerHaptic("error");
                const errData = await res.json().catch(() => null);
                setPinError(errData?.error || "Забагато спроб");
                return;
              }
            }
          } catch {
            // Мережевий збій — переходимо до локальної перевірки
          }
        }

        // 2. Локальна криптографічна перевірка в офлайн-режимі (PBKDF2 + SHA-256)
        try {
          const offlineRes = await verifyOfflinePin(pinInput);
          if (offlineRes.success) {
            triggerHaptic("success");
            onSuccess();
          } else {
            triggerHaptic("error");
            setPinError(offlineRes.error || "Невірний PIN-код");
            setPinInput("");
          }
        } catch {
          triggerHaptic("error");
          setPinError("Помилка офлайн-перевірки PIN-коду");
          setPinInput("");
        }
      } finally {
        setIsVerifyingPin(false);
      }
    },
    [pinInput, onSuccess]
  );

  return {
    pinInput,
    setPinInput,
    pinError,
    setPinError,
    isVerifyingPin,
    setIsVerifyingPin,
    handleLogin,
  };
}
