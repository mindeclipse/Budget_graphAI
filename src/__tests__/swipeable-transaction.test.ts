import { describe, it, expect, vi, beforeEach } from "vitest";
import { Transaction } from "@/types/finance";

// Mock haptics
const mockTriggerHaptic = vi.fn();
vi.mock("@/lib/haptics", () => ({
  triggerHaptic: (type: string) => mockTriggerHaptic(type),
}));

describe("Native iOS Swipe Gestures Physics & Logic", () => {
  const SWIPE_THRESHOLD = 75;
  const MAX_RUBBER_BAND = 130;

  const mockTxExpense: Transaction = {
    id: 1,
    merchant_raw: "Сільпо",
    amount: 350.5,
    currency: "UAH",
    category_name: "Продукти",
    source: "manual",
    type: "expense",
    created_at: "2026-09-14T12:00:00Z",
  };

  const mockTxIncome: Transaction = {
    id: 2,
    merchant_raw: "Зарплата",
    amount: 45000,
    currency: "UAH",
    category_name: "Зарплата/ФОП",
    source: "manual",
    type: "income",
    created_at: "2026-09-14T10:00:00Z",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Розрахунок еластичного супротиву (Rubber-banding)", () => {
    const calculateRubberBandOffset = (diffX: number): number => {
      const sign = Math.sign(diffX);
      const absDiff = Math.abs(diffX);
      if (absDiff > SWIPE_THRESHOLD) {
        const excess = absDiff - SWIPE_THRESHOLD;
        const damped = Math.pow(excess, 0.72) * 2;
        return sign * Math.min(SWIPE_THRESHOLD + damped, MAX_RUBBER_BAND);
      }
      return diffX;
    };

    it("забезпечує лінійний відгук 1:1 до досягнення порогу (75px)", () => {
      expect(calculateRubberBandOffset(30)).toBe(30);
      expect(calculateRubberBandOffset(-50)).toBe(-50);
      expect(calculateRubberBandOffset(75)).toBe(75);
    });

    it("додає прогресивне згасання (damped rubber band) при перевищенні порогу", () => {
      const offsetAt100 = calculateRubberBandOffset(100);
      expect(offsetAt100).toBeGreaterThan(75);
      expect(offsetAt100).toBeLessThan(100); // Супротив менший за 1:1

      const offsetAt200 = calculateRubberBandOffset(200);
      expect(offsetAt200).toBeLessThanOrEqual(MAX_RUBBER_BAND);
    });

    it("симетрично обробляє від'ємні зміщення (свайп вліво)", () => {
      const leftOffset = calculateRubberBandOffset(-100);
      expect(leftOffset).toBeLessThan(-75);
      expect(leftOffset).toBeGreaterThan(-100);
    });
  });

  describe("Розпізнавання вертикального скролу проти горизонтального свайпу", () => {
    const detectSwipeIntent = (
      diffX: number,
      diffY: number
    ): "horizontal_swipe" | "vertical_scroll" | "undetermined" => {
      if (Math.abs(diffX) > 8 || Math.abs(diffY) > 8) {
        if (Math.abs(diffX) > Math.abs(diffY)) {
          return "horizontal_swipe";
        } else {
          return "vertical_scroll";
        }
      }
      return "undetermined";
    };

    it("не перехоплює рух, якщо жест менший за deadzone (8px)", () => {
      expect(detectSwipeIntent(3, 4)).toBe("undetermined");
    });

    it("дозволяє нативний вертикальний скрол без блокування при переважанні Y", () => {
      expect(detectSwipeIntent(5, 25)).toBe("vertical_scroll");
    });

    it("активує свайп картки тільки при переважанні горизонтального руху X", () => {
      expect(detectSwipeIntent(30, 8)).toBe("horizontal_swipe");
      expect(detectSwipeIntent(-40, 5)).toBe("horizontal_swipe");
    });
  });

  describe("Тригери дій та тактильного відгуку Taptic Engine", () => {
    const evaluateSwipeAction = (
      finalOffset: number,
      callbacks: {
        onDelete?: (id: number) => void;
        onSelect?: (tx: Transaction) => void;
        onSplit?: (tx: Transaction) => void;
      },
      tx: Transaction
    ) => {
      const isPast = Math.abs(finalOffset) >= SWIPE_THRESHOLD;
      if (isPast) {
        if (finalOffset < 0 && callbacks.onDelete) {
          mockTriggerHaptic("medium");
          callbacks.onDelete(tx.id);
          return "deleted";
        } else if (finalOffset > 0) {
          mockTriggerHaptic("light");
          const hasSplit =
            Array.isArray(tx.metadata?.receipt_items) &&
            tx.metadata.receipt_items.length > 1;
          if (hasSplit && callbacks.onSplit) {
            callbacks.onSplit(tx);
            return "split";
          } else if (callbacks.onSelect) {
            callbacks.onSelect(tx);
            return "selected";
          }
        }
      }
      return "snap_back";
    };

    it("свайп вліво (<-75px) викликає medium haptic та функцію видалення в кошик", () => {
      const onDelete = vi.fn();
      const action = evaluateSwipeAction(-85, { onDelete }, mockTxExpense);

      expect(action).toBe("deleted");
      expect(mockTriggerHaptic).toHaveBeenCalledWith("medium");
      expect(onDelete).toHaveBeenCalledWith(1);
    });

    it("свайп вправо (>75px) викликає light haptic та відкриття дій транзакції", () => {
      const onSelect = vi.fn();
      const action = evaluateSwipeAction(90, { onSelect }, mockTxExpense);

      expect(action).toBe("selected");
      expect(mockTriggerHaptic).toHaveBeenCalledWith("light");
      expect(onSelect).toHaveBeenCalledWith(mockTxExpense);
    });

    it("свайп вправо чеку з позиціями відкриває спліт", () => {
      const txWithItems: Transaction = {
        ...mockTxExpense,
        metadata: {
          receipt_items: [
            { name: "Хліб", price: 30 },
            { name: "Молоко", price: 45 },
          ],
        },
      };
      const onSplit = vi.fn();
      const action = evaluateSwipeAction(80, { onSplit }, txWithItems);

      expect(action).toBe("split");
      expect(mockTriggerHaptic).toHaveBeenCalledWith("light");
      expect(onSplit).toHaveBeenCalledWith(txWithItems);
    });

    it("недостатній рух (<75px) повертає картку назад (snap back) без дій", () => {
      const onDelete = vi.fn();
      const onSelect = vi.fn();
      const action = evaluateSwipeAction(
        -40,
        { onDelete, onSelect },
        mockTxExpense
      );

      expect(action).toBe("snap_back");
      expect(mockTriggerHaptic).not.toHaveBeenCalled();
      expect(onDelete).not.toHaveBeenCalled();
      expect(onSelect).not.toHaveBeenCalled();
    });
  });
});
