import { useState, useEffect, useCallback } from "react";
import {
  startAuthentication,
  startRegistration,
} from "@simplewebauthn/browser";
import { useAutoLock } from "@/hooks/useAutoLock";
import { triggerHaptic } from "@/lib/haptics";

export function useAuthSession() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState("");
  const [isVerifyingPin, setIsVerifyingPin] = useState(false);

  // Перевірка активної сесії при першому завантаженні
  useEffect(() => {
    const checkAuth = async () => {
      if (
        typeof window !== "undefined" &&
        sessionStorage.getItem("budget_auto_locked") === "true"
      ) {
        setIsAuthenticated(false);
        return;
      }
      try {
        const res = await fetch("/api/auth");
        const data = await res.json();
        setIsAuthenticated(Boolean(data.authenticated));
      } catch {
        setIsAuthenticated(false);
      }
    };
    checkAuth();
  }, []);

  // Вхід через PIN-код
  const handleLogin = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setIsVerifyingPin(true);
      setPinError("");

      try {
        const res = await fetch("/api/auth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pin: pinInput }),
        });

        if (res.ok) {
          triggerHaptic("success");
          if (typeof window !== "undefined") {
            sessionStorage.removeItem("budget_auto_locked");
          }
          setIsAuthenticated(true);
        } else {
          triggerHaptic("error");
          const errData = await res.json().catch(() => null);
          setPinError(errData?.error || "Невірний PIN-код");
        }
      } catch {
        triggerHaptic("error");
        setPinError("Помилка підключення");
      } finally {
        setIsVerifyingPin(false);
      }
    },
    [pinInput]
  );

  // Вхід через Face ID / Touch ID
  const handleBiometricLogin = useCallback(async () => {
    setPinError("");
    setIsVerifyingPin(true);

    try {
      const optsRes = await fetch("/api/auth/webauthn/login");
      if (!optsRes.ok) throw new Error("Біометрія недоступна");
      const options = await optsRes.json();

      const authResp = await startAuthentication({ optionsJSON: options });

      const verifyRes = await fetch("/api/auth/webauthn/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(authResp),
      });

      if (verifyRes.ok) {
        triggerHaptic("success");
        if (typeof window !== "undefined") {
          sessionStorage.removeItem("budget_auto_locked");
        }
        setIsAuthenticated(true);
      } else {
        triggerHaptic("error");
        setPinError("Не вдалося розпізнати");
      }
    } catch (err: any) {
      if (err.name !== "NotAllowedError") {
        triggerHaptic("error");
        setPinError(err.message || "Помилка Face ID");
      }
    } finally {
      setIsVerifyingPin(false);
    }
  }, []);

  // Реєстрація пристрою для Face ID / Touch ID
  const handleRegisterDevice = useCallback(async () => {
    try {
      const optsRes = await fetch("/api/auth/webauthn/register");
      if (!optsRes.ok) throw new Error("Помилка отримання параметрів");
      const options = await optsRes.json();

      const regResp = await startRegistration({ optionsJSON: options });

      const verifyRes = await fetch("/api/auth/webauthn/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(regResp),
      });

      if (verifyRes.ok) {
        alert("✅ Face ID / Touch ID успішно прив'язано до цього пристрою!");
      } else {
        alert("Помилка прив'язки пристрою");
      }
    } catch (err: any) {
      if (err.name !== "NotAllowedError") {
        alert(err.message || "Не вдалося налаштувати біометрію");
      }
    }
  }, []);

  // Вихід із системи
  const handleLogout = useCallback(async () => {
    if (typeof window !== "undefined") {
      sessionStorage.removeItem("budget_auto_locked");
    }
    setIsAuthenticated(false);
    setPinInput("");
    setPinError("");
    await fetch("/api/auth", { method: "DELETE" }).catch(() => null);
  }, []);

  // Автоматичне блокування при неактивності або переході у фон
  const handleAutoLock = useCallback(async () => {
    if (typeof window !== "undefined") {
      sessionStorage.setItem("budget_auto_locked", "true");
    }
    setIsAuthenticated(false);
    setPinInput("");
    setPinError("");
    await fetch("/api/auth", { method: "DELETE" }).catch(() => null);
  }, []);

  useAutoLock({
    isAuthenticated,
    onLock: handleAutoLock,
    inactivityTimeoutMs: 7 * 60 * 1000,
    maxBackgroundTimeMs: 5 * 60 * 1000,
  });

  return {
    isAuthenticated,
    isVerifyingPin,
    pinInput,
    setPinInput,
    pinError,
    handleLogin,
    handleBiometricLogin,
    handleRegisterDevice,
    handleLogout,
  };
}
