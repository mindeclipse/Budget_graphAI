import {
  DetectedSubscription,
  UpcomingScheduleItem,
} from "@/lib/subscription-radar";

export function filterDismissedDetected(
  raw: DetectedSubscription[],
  dismissedSignatures: string[]
): DetectedSubscription[] {
  const dismissedSet = new Set(
    dismissedSignatures.map((s) => s.toLowerCase().trim())
  );
  return raw.filter((sub) => {
    const subId = sub.id.toLowerCase().trim();
    const subTitle = (sub.title || "").toLowerCase().trim();
    const cleanId = subId.replace(/-[0-9]+-[a-z]+$/, "");
    const cleanMerchant = cleanId.replace(/^radar-/, "");

    return (
      !dismissedSet.has(subId) &&
      !dismissedSet.has(subTitle) &&
      !dismissedSet.has(cleanId) &&
      !dismissedSet.has(cleanMerchant) &&
      !Array.from(dismissedSet).some((d) => {
        const dl = d.toLowerCase().trim();
        return (
          dl === subId ||
          dl === subTitle ||
          dl === cleanId ||
          dl === cleanMerchant ||
          (dl.startsWith("radar-") &&
            cleanMerchant.length >= 3 &&
            dl.includes(cleanMerchant)) ||
          (subTitle.length >= 3 && dl.includes(subTitle))
        );
      })
    );
  });
}

export function sortUpcomingObligations(
  raw: UpcomingScheduleItem[]
): UpcomingScheduleItem[] {
  const statusOrder: Record<string, number> = {
    due_today: 0,
    upcoming: 1,
    overdue: 2,
    paid: 3,
  };
  return [...raw].sort((a, b) => {
    const orderA = statusOrder[a.status] ?? 1;
    const orderB = statusOrder[b.status] ?? 1;
    if (orderA !== orderB) {
      return orderA - orderB;
    }
    return a.day_of_month - b.day_of_month;
  });
}
