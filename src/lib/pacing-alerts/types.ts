export interface PacingAlertResult {
  success: boolean;
  sent: boolean;
  alertType?: "pacing_friday_radar" | "pacing_monday_reset";
  reason?: string;
  data?: any;
}

export interface PacingAlertOptions {
  force?: boolean;
  now?: Date;
  supabaseInstance?: any;
}
