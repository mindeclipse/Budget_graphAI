import { useState, useEffect, useCallback, useRef } from "react";
import {
  startAuthentication,
  startRegistration,
} from "@simplewebauthn/browser";
import { useAutoLock } from "@/hooks/useAutoLock";
import { triggerHaptic } from "@/lib/haptics";
import {
  setupOfflinePinVerifier,
  verifyOfflinePin,
  clearOfflinePinVerifier,
  resetOfflinePinAttempts,
} from "@/lib/offline-pin";

export function useAuthSession() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState("");
  const [isVerifyingPin, setIsVerifyingPin] = useState(false);
  const [isBiometricSupported, setIsBiometricSupported] = useState(false);
  const [isOnline, setIsOnline] = useState<boolean>(true);

  // Кеш попередньо завантажених параметрів виклику WebAuthn (Pre-warming)
  const prewarmedOptionsRef = useRef<any>(null);
  const prewarmedTimeRef = useRef<number>(0);

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

  useEffect(() => {
    if (typeof window !== "undefined" && window.PublicKeyCredential) {
      setIsBiometricSupported(true);
    }
  }, []);

  // Фонове завантаження WebAuthn challenge для усунення 3-секундної затримки
  const prewarmBiometrics = useCallback(async () => {
    if (
      typeof window === "undefined" ||
      !window.PublicKeyCredential ||
      !navigator.onLine
    )
      return;
    try {
      const res = await fetch("/api/auth/webauthn/login");
      if (res.ok) {
        const options = await res.json();
        prewarmedOptionsRef.current = options;
        prewarmedTimeRef.current = Date.now();
      }
    } catch {
      // Фоновий збій безпечно ігнорується, буде fallback до звичайного fetch
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

  // Вхід через PIN-код з прозорою підтримкою офлайн-розблокування (PBKDF2)
  const handleLogin = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setIsVerifyingPin(true);
      setPinError("");

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
              if (typeof window !== "undefined") {
                sessionStorage.removeItem("budget_auto_locked");
              }
              // Зберігаємо або освіжаємо локальний криптографічний верифікатор
              await setupOfflinePinVerifier(pinInput);
              resetOfflinePinAttempts();
              setIsAuthenticated(true);
              return;
            }

            if (res.status === 401) {
              triggerHaptic("error");
              const errData = await res.json().catch(() => null);
              setPinError(errData?.error || "Невірний PIN-код");
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
          // Мережевий збій (авіарежим, обрив з'єднання) — переходимо до локальної перевірки
        }
      }

      // 2. Локальна криптографічна перевірка в офлайн-режимі (PBKDF2 + SHA-256)
      try {
        const offlineRes = await verifyOfflinePin(pinInput);
        if (offlineRes.success) {
          triggerHaptic("success");
          if (typeof window !== "undefined") {
            sessionStorage.removeItem("budget_auto_locked");
          }
          setIsAuthenticated(true);
        } else {
          triggerHaptic("error");
          setPinError(offlineRes.error || "Невірний PIN-код");
        }
      } catch {
        triggerHaptic("error");
        setPinError("Помилка офлайн-перевірки PIN-коду");
      } finally {
        setIsVerifyingPin(false);
      }
    },
    [pinInput]
  );

  // Вхід через Face ID / Touch ID (з підтримкою 0-latency pre-warming та офлайн-захистом)
  const handleBiometricLogin = useCallback(async () => {
    setPinError("");

    const currentlyOnline =
      typeof navigator !== "undefined" ? navigator.onLine : true;

    if (!currentlyOnline) {
      triggerHaptic("error");
      setPinError(
        "Face ID потребує інтернет-з'єднання. Для входу офлайн введіть PIN-код."
      );
      return;
    }

    setIsVerifyingPin(true);

    try {
      let options = prewarmedOptionsRef.current;
      const isFresh =
        options && Date.now() - prewarmedTimeRef.current < 4 * 60 * 1000;

      if (!isFresh) {
        const optsRes = await fetch("/api/auth/webauthn/login");
        if (!optsRes.ok) throw new Error("Біометрія недоступна");
        options = await optsRes.json();
      }

      // Одноразовий виклик: відразу скидаємо кеш, щоб запобігти повторному використанню
      prewarmedOptionsRef.current = null;
      prewarmedTimeRef.current = 0;

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
        prewarmBiometrics();
      }
    } catch (err: any) {
      if (err.name !== "NotAllowedError") {
        triggerHaptic("error");
        const isOfflineError =
          !navigator.onLine ||
          err.message?.includes("Load failed") ||
          err.message?.includes("offline") ||
          err.message?.includes("Network");

        if (isOfflineError) {
          setPinError(
            "Face ID потребує інтернет-з'єднання. Для входу офлайн введіть PIN-код."
          );
        } else {
          setPinError(err.message || "Помилка Face ID");
        }
        prewarmBiometrics();
      }
    } finally {
      setIsVerifyingPin(false);
    }
  }, [prewarmBiometrics]);

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
  }, [prewarmBiometrics]);

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
  }, [prewarmBiometrics]);

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
