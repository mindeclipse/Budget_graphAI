"use client";

import { RecurringItem } from "@/types/finance";
import { SubscriptionRadar } from "./SubscriptionRadar";
import {
  SubscriptionRadarResult,
  DetectedSubscription,
} from "@/lib/subscription-radar";

interface RecurringSectionProps {
  recurring: RecurringItem[];
  radarData?: SubscriptionRadarResult;
  isLoadingRadar?: boolean;
  onAddRecurring: () => void;
  onEditRecurring: (item: RecurringItem) => void;
  onExecuteRecurring: (item: RecurringItem) => void;
  onAddDetected?: (sub: DetectedSubscription) => void;
  onDismissDetected?: (signature: string, title?: string) => void;
}

export function RecurringSection({
  recurring,
  radarData,
  isLoadingRadar,
  onAddRecurring,
  onEditRecurring,
  onExecuteRecurring,
  onAddDetected = () => {},
  onDismissDetected = () => {},
}: RecurringSectionProps) {
  return (
    <SubscriptionRadar
      recurring={recurring}
      radarData={radarData}
      isLoading={isLoadingRadar}
      onAddRecurring={onAddRecurring}
      onEditRecurring={onEditRecurring}
      onExecuteRecurring={onExecuteRecurring}
      onAddDetected={onAddDetected}
      onDismissDetected={onDismissDetected}
    />
  );
}
