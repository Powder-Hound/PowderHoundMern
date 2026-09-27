/**
 * CoS lock: no stick SMS / storm alerts until within 16 days of a
 * followed resort's opening, and never unless ENABLE_POWDER_ALERT_CRON
 * is exactly "true". Fail closed when opening date is missing or stale.
 *
 * Do not set ENABLE_POWDER_ALERT_CRON=true without CoS yes.
 */

export const STORM_ALERT_LEAD_DAYS = 16;
/** Implicit season length when `season.end` is absent (blocks last-year dates). */
export const STORM_ALERT_MAX_SEASON_DAYS = 240;
export const POWDER_ALERT_CRON_ENV = "ENABLE_POWDER_ALERT_CRON";

export function isPowderAlertCronEnabled(env = process.env) {
  return env.ENABLE_POWDER_ALERT_CRON === "true";
}

export function openingAlertWindowStatus(
  season,
  now = new Date(),
  leadDays = STORM_ALERT_LEAD_DAYS
) {
  if (!season?.start) {
    return { allowed: false, reason: "missing_opening_date" };
  }

  const start = new Date(season.start);
  if (Number.isNaN(start.getTime())) {
    return { allowed: false, reason: "invalid_opening_date" };
  }

  const windowOpen = new Date(start);
  windowOpen.setUTCDate(windowOpen.getUTCDate() - leadDays);
  if (now < windowOpen) {
    return { allowed: false, reason: "before_lead_window" };
  }

  if (season.end) {
    const end = new Date(season.end);
    if (Number.isNaN(end.getTime())) {
      return { allowed: false, reason: "invalid_season_end" };
    }
    if (now > end) {
      return { allowed: false, reason: "after_season_end" };
    }
  } else {
    const implicitEnd = new Date(start);
    implicitEnd.setUTCDate(
      implicitEnd.getUTCDate() + STORM_ALERT_MAX_SEASON_DAYS
    );
    if (now > implicitEnd) {
      return { allowed: false, reason: "stale_opening_date" };
    }
  }

  return { allowed: true, reason: "within_opening_window" };
}

export function isWithinOpeningAlertWindow(season, now = new Date()) {
  return openingAlertWindowStatus(season, now).allowed;
}

export const STORM_ALERTS_LOCKED_MESSAGE =
  "Storm/stick SMS is locked until CoS sets ENABLE_POWDER_ALERT_CRON=true and each followed resort is within 16 days of opening.";
