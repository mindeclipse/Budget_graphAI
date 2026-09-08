import { useEffect, useRef, useCallback } from "react";

interface UseAutoLockOptions {
  /** Чи авторизований користувач зараз */
  isAuthenticated: boolean | null;
  /** Функція, яка блокує інтерфейс */
  onLock: () => void;
  /** Таймаут бездіяльності в мілісекундах (за замовчуванням 5 хвилин) */
  inactivityTimeoutMs?: number;
  /** Максимальний час у фоні до блокування (за замовчуванням 2 хвилини) */
  maxBackgroundTimeMs?: number;
}

export function useAutoLock({
  isAuthenticated,
  onLock,
  inactivityTimeoutMs = 5 * 60 * 1000, // 5 хвилин
  maxBackgroundTimeMs = 2 * 60 * 1000, // 2 хвилини у згорнутому стані
}: UseAutoLockOptions) {
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const hiddenTimeRef = useRef<number | null>(null);

  const lock = useCallback(() => {
    onLock();
  }, [onLock]);

  const resetInactivityTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    if (isAuthenticated) {
      timerRef.current = setTimeout(lock, inactivityTimeoutMs);
    }
  }, [isAuthenticated, inactivityTimeoutMs, lock]);

  // Відстеження подій активності (кліки, скрол, натискання клавіш, тапи)
  useEffect(() => {
    if (!isAuthenticated) return;

    const events = [
      "mousedown",
      "mousemove",
      "keydown",
      "scroll",
      "touchstart",
    ];

    const handleActivity = () => {
      resetInactivityTimer();
    };

    events.forEach((evt) =>
      window.addEventListener(evt, handleActivity, { passive: true })
    );
    resetInactivityTimer();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      events.forEach((evt) => window.removeEventListener(evt, handleActivity));
    };
  }, [isAuthenticated, resetInactivityTimer]);

  // Відстеження згортання PWA / блокування екрана телефона
  useEffect(() => {
    if (!isAuthenticated) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        hiddenTimeRef.current = Date.now();
      } else if (document.visibilityState === "visible") {
        if (hiddenTimeRef.current) {
          const elapsed = Date.now() - hiddenTimeRef.current;
          hiddenTimeRef.current = null;
          if (elapsed >= maxBackgroundTimeMs) {
            lock();
          } else {
            resetInactivityTimer();
          }
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isAuthenticated, maxBackgroundTimeMs, lock, resetInactivityTimer]);
}
