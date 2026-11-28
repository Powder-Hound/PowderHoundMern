import { Resort } from "../models/resorts.model.js";
import ResortWeatherData from "../models/resortWeatherData.model.js";
import { ForecastIngestRun } from "../models/forecastIngestRun.model.js";
import { ForecastAlertDebounce } from "../models/forecastAlertDebounce.model.js";
import {
  buildIngestRunDocument,
  logIngestFailures,
  sanitizeForecastError,
  summarizeForecastBatch,
} from "../utils/forecastIngestSummary.js";
import {
  buildForecastAlertMessages,
  classifyFreshness,
  considerForecastAlert,
  failureAlertFromSummary,
} from "../utils/forecastFreshness.js";

function mongoDebounceDeps() {
  return {
    readDebounce: async (condition) => {
      const doc = await ForecastAlertDebounce.findOne({ condition }).lean();
      return doc?.dayKey ?? null;
    },
    writeDebounce: async ({ condition, dayKey, sentAt }) => {
      await ForecastAlertDebounce.findOneAndUpdate(
        { condition },
        { $set: { dayKey, sentAt } },
        { upsert: true }
      );
    },
  };
}

export async function dispatchForecastAlerts(
  messages,
  now = new Date(),
  deps = mongoDebounceDeps()
) {
  for (const message of messages) {
    try {
      await considerForecastAlert({
        ...message,
        now,
        readDebounce: deps.readDebounce,
        writeDebounce: deps.writeDebounce,
        sendEmail: deps.sendEmail,
        env: deps.env,
        log: deps.log,
      });
    } catch (err) {
      console.error(
        "ALERT forecast alert dispatch failed:",
        sanitizeForecastError(err)
      );
    }
  }
}

/**
 * Count the batch, log each failure without secrets, store one run row,
 * and alert when the failure rate is above the threshold.
 * Does not fetch weather. Never throws (callers still finish the cron log).
 */
export async function finalizeForecastIngest({
  startedAt,
  settledResults,
  now = new Date(),
  deps,
}) {
  const summary = summarizeForecastBatch(settledResults);
  logIngestFailures(summary);

  try {
    await ForecastIngestRun.create(
      buildIngestRunDocument({ startedAt, finishedAt: now, summary })
    );
  } catch (err) {
    console.error(
      "ALERT forecast ingest could not persist run:",
      sanitizeForecastError(err)
    );
  }

  try {
    const message = failureAlertFromSummary(summary);
    if (message) {
      await dispatchForecastAlerts([message], now, deps);
    }
  } catch (err) {
    console.error(
      "ALERT forecast ingest could not send alert:",
      sanitizeForecastError(err)
    );
  }

  return summary;
}

export async function getForecastFreshnessReport(now = new Date()) {
  const [resortDocs, weatherRows, lastRun] = await Promise.all([
    Resort.find({}, { resortName: 1 }).lean(),
    ResortWeatherData.find({}, { resortId: 1, lastChecked: 1 }).lean(),
    ForecastIngestRun.findOne(
      {},
      {
        startedAt: 1,
        finishedAt: 1,
        total: 1,
        ok: 1,
        failed: 1,
        failedIds: 1,
        errorSamples: 1,
      }
    )
      .sort({ finishedAt: -1 })
      .lean(),
  ]);

  const resorts = resortDocs.map((doc) => ({
    resortId: doc._id,
    resortName: doc.resortName,
  }));

  return classifyFreshness({ resorts, weatherRows, lastRun, now });
}

/** Scheduled and on-demand check. Emails only when a condition fires. */
export async function runScheduledFreshnessCheck(now = new Date(), deps) {
  const report = await getForecastFreshnessReport(now);
  await dispatchForecastAlerts(buildForecastAlertMessages(report), now, deps);
  return report;
}
