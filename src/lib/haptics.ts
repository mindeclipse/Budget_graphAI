// Сервіс тактильного вібровідгуку (Haptic Feedback) для PWA та мобільних браузерів

export type HapticType =
  "light" | "selection" | "medium" | "heavy" | "success" | "warning" | "error";

const HAPTIC_PATTERNS: Record<HapticType, number | number[]> = {
  light: 10,
  selection: 8,
  medium: 20,
  heavy: 40,
  success: [15, 40, 20],
  warning: [30, 40, 30],
  error: [40, 50, 40, 50, 40],
};

/**
 * Безпечно активує тактильний вібровідгук на пристрої користувача.
 * Якщо Web Vibration API не підтримується (десктоп, Safari без підтримки тощо),
 * функція безшумно і безпечно ігнорує виклик, не створюючи помилок.
 */
export function triggerHaptic(type: HapticType = "light"): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  const nav =
    typeof navigator !== "undefined" ? navigator : (window as any).navigator;

  if (!nav || typeof nav.vibrate !== "function") {
    return false;
  }

  try {
    const pattern = HAPTIC_PATTERNS[type] || 10;
    return Boolean(nav.vibrate(pattern));
  } catch {
    // Деякі браузери можуть обмежувати вібрацію без жесту користувача
    return false;
  }
}
