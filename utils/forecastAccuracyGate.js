// Accuracy jobs are off unless CoS sets this to the exact string "true".
// This is not ENABLE_POWDER_ALERT_CRON and does not open the storm/stick path.
export function isForecastAccuracyCronEnabled(env = process.env) {
  return env.ENABLE_FORECAST_ACCURACY_CRON === "true";
}
