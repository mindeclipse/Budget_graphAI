import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { triggerHaptic } from "@/lib/haptics";

// Lightweight browser mock
const mockNavigator: any = {};
(global as any).window = { navigator: mockNavigator };
Object.defineProperty(global, "navigator", {
  value: mockNavigator,
  configurable: true,
  writable: true,
});

describe("Haptics Service (Tactile Feedback)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    delete (window.navigator as any).vibrate;
  });

  it("повертає false, якщо navigator.vibrate не підтримується", () => {
    delete (window.navigator as any).vibrate;
    const result = triggerHaptic("light");
    expect(result).toBe(false);
  });

  it("викликає navigator.vibrate з правильним числовим патерном для light", () => {
    const vibrateMock = vi.fn().mockReturnValue(true);
    Object.defineProperty(window.navigator, "vibrate", {
      value: vibrateMock,
      configurable: true,
      writable: true,
    });

    const result = triggerHaptic("light");
    expect(result).toBe(true);
    expect(vibrateMock).toHaveBeenCalledWith(10);
  });

  it("викликає navigator.vibrate з масивом для success патерну", () => {
    const vibrateMock = vi.fn().mockReturnValue(true);
    Object.defineProperty(window.navigator, "vibrate", {
      value: vibrateMock,
      configurable: true,
      writable: true,
    });

    const result = triggerHaptic("success");
    expect(result).toBe(true);
    expect(vibrateMock).toHaveBeenCalledWith([15, 40, 20]);
  });

  it("безпечно перехоплює помилку (fail-safe), якщо vibrate кидає виключення", () => {
    const vibrateMock = vi.fn().mockImplementation(() => {
      throw new Error("User gesture required");
    });
    Object.defineProperty(window.navigator, "vibrate", {
      value: vibrateMock,
      configurable: true,
      writable: true,
    });

    const result = triggerHaptic("warning");
    expect(result).toBe(false);
  });
});
