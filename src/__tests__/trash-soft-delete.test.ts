import { describe, it, expect } from "vitest";

describe("Trash & Soft Delete Logic (10-Day Retention)", () => {
  // Функція розрахунку залишку днів зберігання у кошику
  const calculateDaysRemaining = (
    deletedAtStr: string,
    now: number = Date.now()
  ) => {
    const deletedTime = new Date(deletedAtStr).getTime();
    const daysPassed = (now - deletedTime) / (1000 * 60 * 60 * 24);
    return Math.max(1, Math.ceil(10 - daysPassed));
  };

  it("повертає 10 днів для щойно видаленої транзакції", () => {
    const now = new Date("2026-09-10T12:00:00Z").getTime();
    const deletedAt = new Date("2026-09-10T11:59:00Z").toISOString();
    expect(calculateDaysRemaining(deletedAt, now)).toBe(10);
  });

  it("коректно зменшує лічильник через 3 та 7 днів", () => {
    const base = new Date("2026-09-10T12:00:00Z").getTime();
    const msInDay = 24 * 60 * 60 * 1000;

    const deleted3DaysAgo = new Date(base - 3 * msInDay).toISOString();
    expect(calculateDaysRemaining(deleted3DaysAgo, base)).toBe(7);

    const deleted7DaysAgo = new Date(base - 7 * msInDay).toISOString();
    expect(calculateDaysRemaining(deleted7DaysAgo, base)).toBe(3);
  });

  it("повертає мінімум 1 день, якщо транзакція на межі 10 днів", () => {
    const base = new Date("2026-09-10T12:00:00Z").getTime();
    const msInDay = 24 * 60 * 60 * 1000;

    const deleted9DaysAgo = new Date(base - 9.2 * msInDay).toISOString();
    expect(calculateDaysRemaining(deleted9DaysAgo, base)).toBe(1);

    const deleted11DaysAgo = new Date(base - 11 * msInDay).toISOString();
    expect(calculateDaysRemaining(deleted11DaysAgo, base)).toBe(1);
  });

  it("визначає транзакції, що підлягають остаточному очищенню кроном (>10 днів)", () => {
    const base = new Date("2026-09-10T00:00:00Z").getTime();
    const msInDay = 24 * 60 * 60 * 1000;
    const tenDaysAgoThreshold = new Date(base - 10 * msInDay);

    const txRecent = { id: 1, deleted_at: new Date(base - 5 * msInDay) };
    const txExpired = { id: 2, deleted_at: new Date(base - 10.5 * msInDay) };

    const shouldPurge = (deletedAt: Date) => deletedAt < tenDaysAgoThreshold;

    expect(shouldPurge(txRecent.deleted_at)).toBe(false);
    expect(shouldPurge(txExpired.deleted_at)).toBe(true);
  });
});
