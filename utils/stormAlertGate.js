/**
 * Storm/stick SMS stays off unless ENABLE_POWDER_ALERT_CRON is exactly
 * the string "true". The 16-day pre-opening season gate was retired on
 * 25 Nov 2026 (resorts are open or opening): a forecast that crosses the
 * user's threshold is eligible for any followed resort.
 *
 * Do not set ENABLE_POWDER_ALERT_CRON in this repo. That flip is a Render
 * env change, done separately from code.
 */

export const POWDER_ALERT_CRON_ENV = "ENABLE_POWDER_ALERT_CRON";

export function isPowderAlertCronEnabled(env = process.env) {
  return env.ENABLE_POWDER_ALERT_CRON === "true";
}

export const STORM_ALERTS_LOCKED_MESSAGE =
  'Storm/stick SMS is locked until ENABLE_POWDER_ALERT_CRON is exactly "true".';
