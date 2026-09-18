import { useState, useEffect, useCallback, useRef } from "react";
import {
  startAuthentication,
  startRegistration,
} from "@simplewebauthn/browser";
import { triggerHaptic } from "@/lib/haptics";

interface UseWebAuthnProps {
  onSuccess: () => void;
  onError: (msg: string) => void;
  onVerificationChange: (isVerifying: boolean) => void;
}

export function useWebAuthn({
  onSuccess,
  onError,
  onVerificationChange,
}: UseWebAuthnProps) {
  const [isBiometricSupported, setIsBiometricSupported] = useState(false);

  // Кеш попередньо завантажених параметрів виклику WebAuthn (Pre-warming)
  const prewarmedOptionsRef = useRef<any>(null);
  const prewarmedTimeRef = useRef<number>(0);

  useEffect(() => {
    if (typeof window !== "undefined" && window.PublicKeyCredential) {
      setIsBiometricSupported(true);
    }
  }, []);

  // Фонове завантаження WebAuthn challenge для усунення затримки
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

  // Вхід через Face ID / Touch ID
  const handleBiometricLogin = useCallback(async () => {
    onError("");

    const currentlyOnline =
      typeof navigator !== "undefined" ? navigator.onLine : true;

    if (!currentlyOnline) {
      triggerHaptic("error");
      onError(
        "Face ID потребує інтернет-з'єднання. Для входу офлайн введіть PIN-код."
      );
      return;
    }

    onVerificationChange(true);

    try {
      let options = prewarmedOptionsRef.current;
      const isFresh =
        options && Date.now() - prewarmedTimeRef.current < 4 * 60 * 1000;

      if (!isFresh) {
        const optsRes = await fetch("/api/auth/webauthn/login");
        if (!optsRes.ok) throw new Error("Біометрія недоступна");
        options = await optsRes.json();
      }

      // Одноразовий виклик: відразу скидаємо кеш
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
        onSuccess();
      } else {
        triggerHaptic("error");
        onError("Не вдалося розпізнати");
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
          onError(
            "Face ID потребує інтернет-з'єднання. Для входу офлайн введіть PIN-код."
          );
        } else {
          onError(err.message || "Помилка Face ID");
        }
        prewarmBiometrics();
      }
    } finally {
      onVerificationChange(false);
    }
  }, [onError, onSuccess, onVerificationChange, prewarmBiometrics]);

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

  return {
    isBiometricSupported,
    prewarmBiometrics,
    handleBiometricLogin,
    handleRegisterDevice,
  };
}
