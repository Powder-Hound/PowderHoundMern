/**
 * Pure counting and redaction for the daily Visual Crossing ingest.
 * {success:false} fulfillments and rejected promises are both failures.
 * Logs and stored samples must never include the API key or a full URL that carries it.
 */

export const FAILED_IDS_SAMPLE_LIMIT = 25;
export const ERROR_SAMPLES_LIMIT = 10;

const VC_URL = /https?:\/\/[^\s)'"<>]*visualcrossing\.com[^\s)'"<>]*/gi;
const KEY_PARAM = /([?&](?:amp;)?key(?:=|%3D))[^&\s]+/gi;

function messageFrom(input) {
  if (input == null) return "Unknown error";
  if (typeof input === "string") return input;
  if (typeof input === "number" || typeof input === "boolean") return String(input);
  if (typeof input.message === "string" && input.message) return input.message;
  return "Unknown error";
}

export function sanitizeForecastError(
  input,
  apiKey = process.env.VISUALCROSSING_KEY
) {
  let text = messageFrom(input);
  if (typeof apiKey === "string" && apiKey.length >= 8 && text.includes(apiKey)) {
    text = text.split(apiKey).join("[redacted]");
  }
  text = text.replace(VC_URL, "[visual-crossing-url]");
  text = text.replace(KEY_PARAM, "$1[redacted]");
  text = text.replace(/\s+/g, " ").trim();
  return text || "Unknown error";
}

function isNestedSummary(value) {
  return Boolean(value)
    && Array.isArray(value.success)
    && Array.isArray(value.failed);
}

function resortFields(result, value) {
  const resortId = value?.resortId ?? result?.resortId ?? null;
  const resortName = value?.resortName ?? result?.resortName ?? null;
  return {
    resortId: resortId == null || resortId === "" ? null : String(resortId),
    resortName: resortName == null || resortName === "" ? null : String(resortName),
  };
}

function failureFrom(result, value, error) {
  return {
    ...resortFields(result, value),
    success: false,
    error: sanitizeForecastError(error ?? value?.error),
  };
}

function successFrom(result, value) {
  return {
    ...resortFields(result, value),
    success: true,
  };
}

/**
 * Count a Promise.allSettled batch.
 * Accepts flat per-resort outcomes and the {success, failed} summary
 * returned by updateWeatherData (where success:false used to be nested
 * inside the success list).
 */
export function summarizeForecastBatch(settledResults) {
  const successes = [];
  const failures = [];

  const consume = (result) => {
    if (!result || result.status === "rejected") {
      failures.push(failureFrom(result, null, result?.reason));
      return;
    }

    const value = result.value;
    if (value == null) {
      failures.push(failureFrom(result, null, "Empty ingest result"));
      return;
    }

    if (isNestedSummary(value)) {
      const nested = [];
      for (const item of value.success) {
        nested.push({
          status: "fulfilled",
          value: item,
          resortId: result.resortId,
          resortName: result.resortName,
        });
      }
      for (const item of value.failed) {
        if (item && typeof item === "object" && item.success === false) {
          nested.push({
            status: "fulfilled",
            value: item,
            resortId: result.resortId,
            resortName: result.resortName,
          });
        } else {
          nested.push({
            status: "rejected",
            reason: item,
            resortId: item?.resortId ?? result.resortId,
            resortName: item?.resortName ?? result.resortName,
          });
        }
      }
      if (nested.length === 0) {
        failures.push(failureFrom(result, null, "Empty ingest result"));
        return;
      }
      for (const item of nested) consume(item);
      return;
    }

    if (value.success === false) {
      failures.push(failureFrom(result, value, value.error || "Resort update failed"));
      return;
    }

    successes.push(successFrom(result, value));
  };

  for (const result of settledResults || []) consume(result);

  const ok = successes.length;
  const failed = failures.length;
  const total = ok + failed;
  return {
    total,
    ok,
    failed,
    successes,
    failures,
    failureRate: total === 0 ? 0 : failed / total,
  };
}

export function formatFailureLine(failure) {
  const resortId = failure?.resortId ?? "unknown";
  const resortName = failure?.resortName ?? "unknown";
  const reason = sanitizeForecastError(failure?.error);
  return `resortId=${resortId} resortName=${resortName} reason=${reason}`;
}

export function logIngestFailures(summary, log = console.error) {
  for (const failure of summary?.failures || []) {
    log(`❌ Forecast ingest failed ${formatFailureLine(failure)}`);
  }
}

export function buildIngestRunDocument({
  startedAt,
  finishedAt = new Date(),
  summary,
}) {
  const failures = summary?.failures || [];
  return {
    startedAt,
    finishedAt,
    total: summary?.total ?? 0,
    ok: summary?.ok ?? 0,
    failed: summary?.failed ?? 0,
    failedIds: failures
      .slice(0, FAILED_IDS_SAMPLE_LIMIT)
      .map((failure) => failure.resortId ?? "unknown"),
    errorSamples: failures
      .slice(0, ERROR_SAMPLES_LIMIT)
      .map((failure) => sanitizeForecastError(
        `${failure.resortId ?? "unknown"} ${failure.resortName ?? "unknown"}: ${failure.error ?? "Unknown error"}`
      )),
  };
}
