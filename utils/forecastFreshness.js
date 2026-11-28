/**
 * Freshness rules for resort forecasts.
 * STALE_AFTER_MS and MAX_FAILURE_RATE are the only thresholds.
 * Alerts debounce to one send per MST calendar day per condition.
 * FORECAST_ALERT_EMAIL unset → log a single ALERT line and do not email.
 */

import {
  ERROR_SAMPLES_LIMIT,
  formatFailureLine,
  sanitizeForecastError,
} from "./forecastIngestSummary.js";

/** lastChecked older than this is stale. */
export const STALE_AFTER_MS = 26 * 60 * 60 * 1000;

/** Failure rate strictly above this flags the latest ingest run. */
export const MAX_FAILURE_RATE = 0.02;

/** Fixed MST (UTC−7), matching the ingest cron's timezone label. */
export const FORECAST_ALERT_TZ_OFFSET_MS = 7 * 60 * 60 * 1000;

export const FORECAST_ALERT_CONDITIONS = {
  staleResorts: "stale_resorts",
  highFailureRate: "high_failure_rate",
};

export function mountainDayKey(date) {
  const value = date instanceof Date ? date : new Date(date);
  return new Date(value.getTime() - FORECAST_ALERT_TZ_OFFSET_MS)
    .toISOString()
    .slice(0, 10);
}

export function shouldSendForecastAlert({ lastDayKey, now }) {
  if (!lastDayKey) return true;
  return lastDayKey !== mountainDayKey(now);
}

export function isLastCheckedStale(lastChecked, now, staleAfterMs = STALE_AFTER_MS) {
  if (lastChecked == null || lastChecked === "") return true;
  const ms = new Date(lastChecked).getTime();
  if (!Number.isFinite(ms)) return true;
  const current = now instanceof Date ? now.getTime() : new Date(now).getTime();
  return current - ms > staleAfterMs;
}

/**
 * True when failed/total is strictly above maxRate.
 * Integer basis points avoid a float edge at exactly 2%.
 */
export function isFailureRateHigh(run, maxRate = MAX_FAILURE_RATE) {
  if (!run) return false;
  const total = Number(run.total);
  const failed = Number(run.failed);
  if (!Number.isFinite(total) || total <= 0) return false;
  if (!Number.isFinite(failed) || failed <= 0) return false;
  const thresholdBps = Math.round(maxRate * 10000);
  return failed * 10000 > total * thresholdBps;
}

function iso(value) {
  if (value == null || value === "") return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

export function classifyFreshness({
  resorts = [],
  weatherRows = [],
  lastRun = null,
  now = new Date(),
  staleAfterMs = STALE_AFTER_MS,
  maxFailureRate = MAX_FAILURE_RATE,
} = {}) {
  const current = now instanceof Date ? now : new Date(now);
  const byId = new Map();

  for (const row of weatherRows) {
    if (row?.resortId != null && row.resortId !== "") {
      byId.set(String(row.resortId), row);
    }
  }

  let staleCount = 0;
  let oldestMs = null;
  for (const resort of resorts) {
    const id = resort?.resortId ?? resort?._id;
    const row = id == null ? undefined : byId.get(String(id));
    const ms = row?.lastChecked == null || row.lastChecked === ""
      ? NaN
      : new Date(row.lastChecked).getTime();
    if (Number.isFinite(ms) && (oldestMs == null || ms < oldestMs)) oldestMs = ms;
    // No weather row means there is no lastChecked, so the resort is stale.
    if (isLastCheckedStale(row?.lastChecked, current, staleAfterMs)) staleCount += 1;
  }

  const failureRateHigh = isFailureRateHigh(lastRun, maxFailureRate);
  const publicRun = lastRun
    ? {
        startedAt: iso(lastRun.startedAt),
        finishedAt: iso(lastRun.finishedAt),
        total: Number(lastRun.total) || 0,
        ok: Number(lastRun.ok) || 0,
        failed: Number(lastRun.failed) || 0,
        failedIds: Array.isArray(lastRun.failedIds)
          ? lastRun.failedIds.map((id) => String(id))
          : [],
        errorSamples: Array.isArray(lastRun.errorSamples)
          ? lastRun.errorSamples.map((sample) => sanitizeForecastError(sample))
          : [],
      }
    : null;

  return {
    ok: staleCount === 0 && !failureRateHigh,
    staleCount,
    oldestLastChecked: oldestMs == null ? null : new Date(oldestMs).toISOString(),
    lastRun: publicRun,
    failureRateHigh,
    conditions: {
      staleResorts: staleCount > 0,
      highFailureRate: failureRateHigh,
    },
  };
}

export function buildFreshnessPayload(report) {
  const run = report?.lastRun;
  return {
    ok: Boolean(report?.ok),
    lastRun: run
      ? {
          startedAt: run.startedAt ?? null,
          finishedAt: run.finishedAt ?? null,
          total: run.total ?? 0,
          ok: run.ok ?? 0,
          failed: run.failed ?? 0,
          failedIds: Array.isArray(run.failedIds) ? run.failedIds.map(String) : [],
          errorSamples: Array.isArray(run.errorSamples)
            ? run.errorSamples.map((sample) => sanitizeForecastError(sample))
            : [],
        }
      : null,
    staleCount: Number(report?.staleCount) || 0,
    oldestLastChecked: report?.oldestLastChecked ?? null,
  };
}

export function failureAlertFromSummary(summary) {
  if (!isFailureRateHigh(summary)) return null;
  const samples = (summary.failures || [])
    .slice(0, ERROR_SAMPLES_LIMIT)
    .map((failure) => formatFailureLine(failure));
  const sampleText = samples.length ? samples.join(" | ") : "none";
  return {
    condition: FORECAST_ALERT_CONDITIONS.highFailureRate,
    subject: "PowderHound forecast alert: ingest failure rate above 2%",
    body: `Visual Crossing ingest failed ${summary.failed} of ${summary.total} resorts (threshold ${MAX_FAILURE_RATE * 100}%). ${sampleText}`,
  };
}

export function buildForecastAlertMessages(report) {
  const messages = [];
  if (report?.staleCount > 0) {
    const hours = STALE_AFTER_MS / (60 * 60 * 1000);
    messages.push({
      condition: FORECAST_ALERT_CONDITIONS.staleResorts,
      subject: "PowderHound forecast alert: stale resort weather",
      body: `${report.staleCount} resorts have lastChecked older than ${hours} hours. Oldest lastChecked: ${report.oldestLastChecked ?? "missing"}.`,
    });
  }
  if (report?.failureRateHigh && report.lastRun) {
    const samples = (report.lastRun.errorSamples || []).join(" | ") || "none";
    messages.push({
      condition: FORECAST_ALERT_CONDITIONS.highFailureRate,
      subject: "PowderHound forecast alert: ingest failure rate above 2%",
      body: `Last run failed ${report.lastRun.failed} of ${report.lastRun.total} resorts (threshold ${MAX_FAILURE_RATE * 100}%). Samples: ${samples}.`,
    });
  }
  return messages;
}

async function loadSendGridEmail() {
  const mod = await import("./sendgridService.js");
  return mod.sendEmail;
}

/**
 * Send at most one alert per MST day for this condition.
 * When FORECAST_ALERT_EMAIL is unset, log one ALERT line and do not email.
 * A failed send is not debounced, so the next check can retry.
 */
export async function considerForecastAlert({
  condition,
  subject,
  body,
  now = new Date(),
  env = process.env,
  sendEmail,
  readDebounce = async () => null,
  writeDebounce = async () => {},
  log = (...args) => console.error(...args),
} = {}) {
  const dayKey = mountainDayKey(now);
  const lastDayKey = await readDebounce(condition);
  if (!shouldSendForecastAlert({ lastDayKey, now })) {
    return { condition, sent: false, logged: false, debounced: true, dayKey };
  }

  const safeSubject = sanitizeForecastError(subject);
  const safeBody = sanitizeForecastError(body);
  const to = String(env?.FORECAST_ALERT_EMAIL || "").trim();
  if (!to) {
    log(`ALERT ${safeSubject} — ${safeBody}`);
    await writeDebounce({ condition, dayKey, sentAt: now });
    return { condition, sent: false, logged: true, debounced: false, dayKey };
  }

  try {
    const mailer = sendEmail || (await loadSendGridEmail());
    await mailer(to, safeSubject, safeBody);
    await writeDebounce({ condition, dayKey, sentAt: now });
    return { condition, sent: true, logged: false, debounced: false, dayKey };
  } catch (err) {
    log(`ALERT ${safeSubject} — email failed: ${sanitizeForecastError(err)}`);
    return {
      condition,
      sent: false,
      logged: true,
      debounced: false,
      dayKey,
      emailError: true,
    };
  }
}
