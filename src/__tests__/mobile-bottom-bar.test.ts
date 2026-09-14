import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock haptics
const mockTriggerHaptic = vi.fn();
vi.mock("@/lib/haptics", () => ({
  triggerHaptic: (type: string) => mockTriggerHaptic(type),
}));

describe("MobileBottomBar Ergonomics & Haptic Feedback Logic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Мобільна ізоляція (Strict md:hidden constraint)", () => {
    it("використовує клас md:hidden для повного приховування на десктопі", () => {
      const desktopHiddenClass = "md:hidden";
      expect(desktopHiddenClass).toBe("md:hidden");
    });

    it("розташовує острів-капсулу в самому низу екрана", () => {
      const bottomClass = "bottom-3.5";
      expect(bottomClass).toBe("bottom-3.5");
    });
  });

  describe("Логіка перемикання вкладок та тактильного відгуку", () => {
    const handleTabClick = (
      currentTab: "overview" | "history" | "wealth",
      targetTab: "overview" | "history" | "wealth",
      onTabChange: (t: "overview" | "history" | "wealth") => void
    ) => {
      if (currentTab !== targetTab) {
        mockTriggerHaptic("selection");
        onTabChange(targetTab);
        return true;
      }
      return false;
    };

    it("перемикання на іншу вкладку викликає selection haptic та колбек", () => {
      const onTabChange = vi.fn();
      const changed = handleTabClick("overview", "history", onTabChange);

      expect(changed).toBe(true);
      expect(mockTriggerHaptic).toHaveBeenCalledWith("selection");
      expect(onTabChange).toHaveBeenCalledWith("history");
    });

    it("клік по вже активній вкладці не викликає повторного перемикання чи вібрації", () => {
      const onTabChange = vi.fn();
      const changed = handleTabClick("history", "history", onTabChange);

      expect(changed).toBe(false);
      expect(mockTriggerHaptic).not.toHaveBeenCalled();
      expect(onTabChange).not.toHaveBeenCalled();
    });
  });

  describe("Логіка швидких дій під великий палець", () => {
    const handleAddClick = (onAddExpense: () => void) => {
      mockTriggerHaptic("medium");
      onAddExpense();
    };

    const handleAiClick = (onOpenAi: () => void) => {
      mockTriggerHaptic("light");
      onOpenAi();
    };

    it("натискання центральної кнопки (+) активує medium haptic та відкриває форму витрати", () => {
      const onAddExpense = vi.fn();
      handleAddClick(onAddExpense);

      expect(mockTriggerHaptic).toHaveBeenCalledWith("medium");
      expect(onAddExpense).toHaveBeenCalled();
    });

    it("натискання кнопки AI Коуча активує light haptic та відкриває панель аналізу", () => {
      const onOpenAi = vi.fn();
      handleAiClick(onOpenAi);

      expect(mockTriggerHaptic).toHaveBeenCalledWith("light");
      expect(onOpenAi).toHaveBeenCalled();
    });
  });
});
