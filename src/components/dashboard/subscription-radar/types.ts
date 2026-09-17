import { RecurringItem } from "@/types/finance";
import {
  SubscriptionRadarResult,
  DetectedSubscription,
} from "@/lib/subscription-radar";

export type RadarTabType = "calendar" | "radar" | "all";

export interface SubscriptionRadarProps {
  recurring: RecurringItem[];
  radarData?: SubscriptionRadarResult;
  isLoading?: boolean;
  onAddRecurring: () => void;
  onEditRecurring: (item: RecurringItem) => void;
  onExecuteRecurring: (item: RecurringItem) => void;
  onAddDetected: (sub: DetectedSubscription) => void;
  onDismissDetected: (signature: string, title?: string) => void;
}
