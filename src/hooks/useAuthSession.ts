import { useState, useEffect, useCallback } from "react";
import { useAutoLock } from "@/hooks/useAutoLock";
import { clearOfflinePinVerifier } from "@/lib/offline-pin";
import { useWebAuthn, usePinAuth } from "./auth";

export function useAuthSession() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(true);

  const handleAuthSuccess = useCallback(() => {
    if (typeof window !== "undefined") {
      sessionStorage.removeItem("budget_auto_locked");
    }
    setIsAuthenticated(true);
  }, []);

  const {
    pinInput,
    setPinInput,
    pinError,
    setPinError,
    isVerifyingPin,
    setIsVerifyingPin,
    handleLogin,
  } = usePinAuth({ onSuccess: handleAuthSuccess });

  const {
    isBiometricSupported,
    prewarmBiometrics,
    handleBiometricLogin,
    handleRegisterDevice,
  } = useWebAuthn({
    onSuccess: handleAuthSuccess,
    onError: setPinError,
    onVerificationChange: setIsVerifyingPin,
  });

  // Відстеження стану мережі онлайн/офлайн
  useEffect(() => {
    if (typeof window !== "undefined") {
      setIsOnline(navigator.onLine);
      const handleOnline = () => setIsOnline(true);
      const handleOffline = () => setIsOnline(false);
      window.addEventListener("online", handleOnline);
      window.addEventListener("offline", handleOffline);
      return () => {
        window.removeEventListener("online", handleOnline);
        window.removeEventListener("offline", handleOffline);
      };
    }
  }, []);

  // Перевірка активної сесії при першому завантаженні
  useEffect(() => {
    const checkAuth = async () => {
      if (
        typeof window !== "undefined" &&
        sessionStorage.getItem("budget_auto_locked") === "true"
      ) {
        setIsAuthenticated(false);
        prewarmBiometrics();
        return;
      }
      try {
        const res = await fetch("/api/auth");
        const data = await res.json();
        const authed = Boolean(data.authenticated);
        setIsAuthenticated(authed);
        if (!authed) {
          prewarmBiometrics();
        }
      } catch {
        setIsAuthenticated(false);
        prewarmBiometrics();
      }
    };
    checkAuth();
  }, [prewarmBiometrics]);

  // Вихід із системи (повне очищення онлайн та офлайн сесій)
  const handleLogout = useCallback(async () => {
    if (typeof window !== "undefined") {
      sessionStorage.removeItem("budget_auto_locked");
    }
    clearOfflinePinVerifier();
    setIsAuthenticated(false);
    setPinInput("");
    setPinError("");
    prewarmBiometrics();
    await fetch("/api/auth", { method: "DELETE" }).catch(() => null);
  }, [prewarmBiometrics, setPinInput, setPinError]);

  // Автоматичне блокування при неактивності або переході у фон
  const handleAutoLock = useCallback(async () => {
    if (typeof window !== "undefined") {
      sessionStorage.setItem("budget_auto_locked", "true");
    }
    setIsAuthenticated(false);
    setPinInput("");
    setPinError("");
    prewarmBiometrics();
    await fetch("/api/auth", { method: "DELETE" }).catch(() => null);
  }, [prewarmBiometrics, setPinInput, setPinError]);

  useAutoLock({
    isAuthenticated,
    onLock: handleAutoLock,
    inactivityTimeoutMs: 7 * 60 * 1000,
    maxBackgroundTimeMs: 5 * 60 * 1000,
  });

  return {
    isAuthenticated,
    isVerifyingPin,
    isBiometricSupported,
    isOnline,
    pinInput,
    setPinInput,
    pinError,
    handleLogin,
    handleBiometricLogin,
    handleRegisterDevice,
    handleLogout,
  };
}
