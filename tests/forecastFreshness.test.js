import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import express from "express";
import { ForecastIngestRun } from "../models/forecastIngestRun.model.js";
import {
  ERROR_SAMPLES_LIMIT,
  FAILED_IDS_SAMPLE_LIMIT,
  buildIngestRunDocument,
  logIngestFailures,
  sanitizeForecastError,
  summarizeForecastBatch,
} from "../utils/forecastIngestSummary.js";
import {
  MAX_FAILURE_RATE,
  STALE_AFTER_MS,
  buildForecastAlertMessages,
  buildFreshnessPayload,
  classifyFreshness,
  considerForecastAlert,
  failureAlertFromSummary,
  isFailureRateHigh,
  isLastCheckedStale,
  mountainDayKey,
} from "../utils/forecastFreshness.js";
import {
  createForecastFreshnessHandler,
  createForecastHealthLimiter,
} from "../api/health.routes.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SECRET = "vc_test_key_0123456789abcdef";
const VC_URL =
  "https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline/39.6,-106.3/2026-11-27/2026-12-11" +
  `?unitGroup=metric&key=${SECRET}&include=days`;

function assertNoSecrets(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  assert.equal(text.includes(SECRET), false);
  assert.equal(/visualcrossing\.com/i.test(text), false);
  assert.equal(/[?&]key=/i.test(text), false);
}

function debounceStore(seed = []) {
  const saved = new Map(seed);
  return {
    saved,
    readDebounce: async (condition) => saved.get(condition) ?? null,
    writeDebounce: async ({ condition, dayKey }) => {
      saved.set(condition, dayKey);
    },
  };
}

function listen(app) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, "127.0.0.1");
    server.once("listening", () => resolve(server));
    server.once("error", reject);
  });
}

describe("forecast ingest counting", () => {
  it("counts success, success:false, and rejected promises, and strips the API key", () => {
    const summary = summarizeForecastBatch([
      {
        status: "fulfilled",
        value: { resortId: "aaa", resortName: "Arapahoe Basin", success: true },
      },
      {
        status: "fulfilled",
        value: {
          resortId: "bbb",
          resortName: "Breckenridge",
          success: false,
          error: `quota exceeded for ${VC_URL}`,
        },
      },
      {
        status: "rejected",
        reason: new Error(`network down ${VC_URL}`),
        resortId: "ccc",
        resortName: "Copper",
      },
    ]);

    assert.equal(summary.total, 3);
    assert.equal(summary.ok, 1);
    assert.equal(summary.failed, 2);
    assert.deepEqual(
      summary.failures.map((failure) => failure.resortId),
      ["bbb", "ccc"]
    );
    assert.deepEqual(
      summary.failures.map((failure) => failure.resortName),
      ["Breckenridge", "Copper"]
    );
    assert.match(summary.failures[0].error, /quota exceeded/);
    assert.match(summary.failures[1].error, /network down/);
    assertNoSecrets(summary);

    const lines = [];
    logIngestFailures(summary, (line) => lines.push(line));
    assert.equal(lines.length, 2);
    assert.match(lines[0], /resortId=bbb/);
    assert.match(lines[0], /resortName=Breckenridge/);
    assert.match(lines[1], /resortId=ccc/);
    assert.match(lines[1], /resortName=Copper/);
    assertNoSecrets(lines.join("\n"));
  });

  it("counts a fulfilled updateWeatherData summary that hid success:false inside success", () => {
    const summary = summarizeForecastBatch([
      {
        status: "fulfilled",
        resortId: "1",
        resortName: "Ok Hill",
        value: {
          success: [{ resortId: "1", resortName: "Ok Hill", success: true }],
          failed: [],
        },
      },
      {
        status: "fulfilled",
        resortId: "2",
        resortName: "Bad Hill",
        value: {
          success: [{
            resortId: "2",
            resortName: "Bad Hill",
            success: false,
            error: `No forecast ${VC_URL}`,
          }],
          failed: [],
        },
      },
      {
        status: "fulfilled",
        resortId: "3",
        resortName: "Worse Hill",
        value: {
          success: [],
          failed: [{
            resortId: "3",
            resortName: "Worse Hill",
            success: false,
            error: "db down",
          }],
        },
      },
      {
        status: "rejected",
        reason: new Error("boom"),
        resortId: "4",
        resortName: "Rejected Hill",
      },
    ]);

    assert.equal(summary.ok, 1);
    assert.equal(summary.failed, 3);
    assert.equal(summary.total, 4);
    assert.deepEqual(
      summary.failures.map((failure) => failure.resortName),
      ["Bad Hill", "Worse Hill", "Rejected Hill"]
    );
    assertNoSecrets(summary);
  });

  it("stores a capped run record and a direct key mention is redacted", () => {
    assert.equal(
      sanitizeForecastError(`bad key ${SECRET}`, SECRET).includes(SECRET),
      false
    );

    const failures = Array.from({ length: 30 }, (_, index) => ({
      resortId: `id-${index}`,
      resortName: `Resort ${index}`,
      error: index === 0 ? `quota ${VC_URL}` : "quota",
    }));
    const doc = buildIngestRunDocument({
      startedAt: new Date("2026-11-28T13:30:00.000Z"),
      finishedAt: new Date("2026-11-28T13:41:00.000Z"),
      summary: { total: 30, ok: 0, failed: 30, failures },
    });

    assert.equal(doc.total, 30);
    assert.equal(doc.ok, 0);
    assert.equal(doc.failed, 30);
    assert.equal(doc.failedIds.length, FAILED_IDS_SAMPLE_LIMIT);
    assert.equal(doc.errorSamples.length, ERROR_SAMPLES_LIMIT);
    assert.equal(doc.failedIds[0], "id-0");
    assert.match(doc.errorSamples[0], /id-0 Resort 0/);
    assertNoSecrets(doc);

    const modelDoc = new ForecastIngestRun(doc);
    assert.equal(modelDoc.validateSync(), undefined);
    assert.ok(new ForecastIngestRun({}).validateSync());
  });
});

describe("forecast staleness detection", () => {
  const now = new Date("2026-11-28T12:00:00.000Z");

  it("uses a 26 hour stale window and a failure rate strictly above 2%", () => {
    assert.equal(STALE_AFTER_MS, 26 * 60 * 60 * 1000);
    assert.equal(MAX_FAILURE_RATE, 0.02);

    const exact = new Date(now.getTime() - STALE_AFTER_MS);
    assert.equal(isLastCheckedStale(exact, now), false);
    assert.equal(isLastCheckedStale(new Date(exact.getTime() - 1), now), true);
    assert.equal(isLastCheckedStale(null, now), true);
    assert.equal(isLastCheckedStale(undefined, now), true);
    assert.equal(isLastCheckedStale("not-a-date", now), true);

    assert.equal(isFailureRateHigh({ total: 50, failed: 1 }), false);
    assert.equal(isFailureRateHigh({ total: 100, failed: 2 }), false);
    assert.equal(isFailureRateHigh({ total: 50, failed: 2 }), true);
    assert.equal(isFailureRateHigh({ total: 49, failed: 1 }), true);
    assert.equal(isFailureRateHigh({ total: 0, failed: 1 }), false);
    assert.equal(isFailureRateHigh(null), false);
  });

  it("flags stale or missing lastChecked and a high failure rate on the latest run", () => {
    const fresh = now.toISOString();
    const exact = new Date(now.getTime() - STALE_AFTER_MS);
    const older = new Date(exact.getTime() - 60 * 1000);

    const healthy = classifyFreshness({
      resorts: [
        { resortId: "a", resortName: "Alpha" },
        { resortId: "b", resortName: "Beta" },
      ],
      weatherRows: [
        { resortId: "a", lastChecked: fresh },
        { resortId: "b", lastChecked: exact },
      ],
      lastRun: {
        startedAt: fresh,
        finishedAt: fresh,
        total: 50,
        ok: 49,
        failed: 1,
        failedIds: ["b"],
        errorSamples: [`b Beta: quota ${VC_URL}`],
      },
      now,
    });
    assert.equal(healthy.ok, true);
    assert.equal(healthy.staleCount, 0);
    assert.equal(healthy.failureRateHigh, false);
    assert.equal(healthy.oldestLastChecked, exact.toISOString());
    assertNoSecrets(healthy.lastRun);

    const stale = classifyFreshness({
      resorts: [
        { resortId: "a", resortName: "Alpha" },
        { resortId: "b", resortName: "Beta" },
      ],
      weatherRows: [
        { resortId: "a", lastChecked: fresh },
        { resortId: "b", lastChecked: older },
      ],
      lastRun: {
        startedAt: fresh,
        finishedAt: fresh,
        total: 100,
        ok: 100,
        failed: 0,
        failedIds: [],
        errorSamples: [],
      },
      now,
    });
    assert.equal(stale.ok, false);
    assert.equal(stale.staleCount, 1);
    assert.equal(stale.oldestLastChecked, older.toISOString());
    assert.equal(stale.conditions.staleResorts, true);
    assert.equal(stale.conditions.highFailureRate, false);

    const missing = classifyFreshness({
      resorts: [
        { resortId: "a", resortName: "Alpha" },
        { resortId: "b", resortName: "Beta" },
      ],
      weatherRows: [{ resortId: "a", lastChecked: fresh }],
      lastRun: null,
      now,
    });
    assert.equal(missing.ok, false);
    assert.equal(missing.staleCount, 1);
    assert.equal(missing.lastRun, null);
    assert.equal(missing.oldestLastChecked, fresh);

    const highRate = classifyFreshness({
      resorts: [{ resortId: "a", resortName: "Alpha" }],
      weatherRows: [{ resortId: "a", lastChecked: fresh }],
      lastRun: {
        startedAt: fresh,
        finishedAt: fresh,
        total: 50,
        ok: 48,
        failed: 2,
        failedIds: ["x"],
        errorSamples: ["x X: quota"],
      },
      now,
    });
    assert.equal(highRate.ok, false);
    assert.equal(highRate.staleCount, 0);
    assert.equal(highRate.failureRateHigh, true);

    const both = classifyFreshness({
      resorts: [{ resortId: "a", resortName: "Alpha" }],
      weatherRows: [{ resortId: "a", lastChecked: older }],
      lastRun: highRate.lastRun,
      now,
    });
    assert.equal(both.ok, false);
    assert.equal(both.staleCount, 1);
    assert.equal(both.failureRateHigh, true);
  });
});

describe("forecast alert debounce", () => {
  const today = new Date("2026-11-28T15:00:00.000Z");
  const yesterday = new Date("2026-11-28T06:30:00.000Z");
  const dirtyBody = `Ingest failed 20 of 100. ${VC_URL}`;

  it("splits MST calendar days at 07:00 UTC", () => {
    assert.equal(mountainDayKey(today), "2026-11-28");
    assert.equal(mountainDayKey(yesterday), "2026-11-27");
  });

  it("logs one ALERT line and does not email when FORECAST_ALERT_EMAIL is unset", async () => {
    const store = debounceStore();
    const logs = [];
    let sends = 0;
    const message = {
      condition: "high_failure_rate",
      subject: "PowderHound forecast alert: ingest failure rate above 2%",
      body: dirtyBody,
      now: today,
      env: {},
      sendEmail: async () => {
        sends += 1;
      },
      log: (...args) => logs.push(args.join(" ")),
      readDebounce: store.readDebounce,
      writeDebounce: store.writeDebounce,
    };

    const first = await considerForecastAlert(message);
    const second = await considerForecastAlert(message);

    assert.equal(first.logged, true);
    assert.equal(first.sent, false);
    assert.equal(second.debounced, true);
    assert.equal(sends, 0);
    assert.equal(logs.length, 1);
    assert.match(logs[0], /^ALERT /);
    assertNoSecrets(logs[0]);
    assert.equal(store.saved.get("high_failure_rate"), "2026-11-28");
  });

  it("sends at most one email per condition per MST day", async () => {
    const store = debounceStore();
    const sent = [];
    const sendEmail = async (to, subject, body) => {
      sent.push({ to, subject, body });
    };
    const base = {
      now: today,
      env: { FORECAST_ALERT_EMAIL: "ops@example.com" },
      sendEmail,
      readDebounce: store.readDebounce,
      writeDebounce: store.writeDebounce,
      log: () => {},
    };

    const failure = failureAlertFromSummary({
      total: 100,
      ok: 90,
      failed: 10,
      failures: [{
        resortId: "bbb",
        resortName: "Breckenridge",
        error: `quota ${VC_URL}`,
      }],
    });
    assert.ok(failure);
    assert.equal(failureAlertFromSummary({ total: 50, failed: 1, failures: [] }), null);

    const first = await considerForecastAlert({ ...base, ...failure });
    const second = await considerForecastAlert({ ...base, ...failure });
    const stale = buildForecastAlertMessages({
      staleCount: 4,
      oldestLastChecked: "2026-11-26T06:30:00.000Z",
      failureRateHigh: false,
      lastRun: null,
    })[0];
    const other = await considerForecastAlert({ ...base, ...stale });

    assert.equal(first.sent, true);
    assert.equal(second.debounced, true);
    assert.equal(other.sent, true);
    assert.equal(sent.length, 2);
    assert.equal(sent[0].to, "ops@example.com");
    assert.equal(sent[1].to, "ops@example.com");
    assertNoSecrets(sent);

    const nextDay = await considerForecastAlert({
      ...base,
      ...failure,
      now: new Date("2026-11-29T15:00:00.000Z"),
    });
    assert.equal(nextDay.sent, true);
    assert.equal(sent.length, 3);

    const retryStore = debounceStore();
    let attempts = 0;
    const failedSend = await considerForecastAlert({
      condition: "high_failure_rate",
      subject: "PowderHound forecast alert: ingest failure rate above 2%",
      body: "10 of 100 failed",
      now: today,
      env: { FORECAST_ALERT_EMAIL: "ops@example.com" },
      sendEmail: async () => {
        attempts += 1;
        throw new Error(`smtp down ${VC_URL}`);
      },
      readDebounce: retryStore.readDebounce,
      writeDebounce: retryStore.writeDebounce,
      log: () => {},
    });
    assert.equal(failedSend.emailError, true);
    assert.equal(retryStore.saved.size, 0);
    assert.equal(attempts, 1);
  });
});

describe("GET /api/health/forecast-freshness", () => {
  const lastRun = {
    startedAt: "2026-11-27T13:30:00.000Z",
    finishedAt: "2026-11-27T13:41:00.000Z",
    total: 326,
    ok: 300,
    failed: 26,
    failedIds: ["id-1"],
    errorSamples: [`id-1 Breckenridge: quota ${VC_URL}`],
    email: "person@example.com",
    apiKey: SECRET,
  };

  it("returns the public shape with no secrets", () => {
    const payload = buildFreshnessPayload({
      ok: false,
      staleCount: 4,
      oldestLastChecked: "2026-11-26T06:30:00.000Z",
      lastRun,
      apiKey: SECRET,
      failureRateHigh: true,
    });

    assert.deepEqual(Object.keys(payload).sort(), [
      "lastRun",
      "ok",
      "oldestLastChecked",
      "staleCount",
    ]);
    assert.equal(payload.ok, false);
    assert.equal(payload.staleCount, 4);
    assert.equal(payload.oldestLastChecked, "2026-11-26T06:30:00.000Z");
    assert.deepEqual(Object.keys(payload.lastRun).sort(), [
      "errorSamples",
      "failed",
      "failedIds",
      "finishedAt",
      "ok",
      "startedAt",
      "total",
    ]);
    assert.equal(payload.lastRun.total, 326);
    assert.equal(payload.lastRun.failed, 26);
    assert.deepEqual(payload.lastRun.failedIds, ["id-1"]);
    assertNoSecrets(payload);
    assert.equal(JSON.stringify(payload).includes("person@example.com"), false);
  });

  it("serves that shape over HTTP and rate limits by IP", async () => {
    let reportCalls = 0;
    const app = express();
    app.get(
      "/api/health/forecast-freshness",
      createForecastFreshnessHandler({
        getReport: async () => {
          reportCalls += 1;
          return {
            ok: true,
            staleCount: 0,
            oldestLastChecked: "2026-11-28T13:30:00.000Z",
            lastRun: {
              startedAt: "2026-11-28T13:30:00.000Z",
              finishedAt: "2026-11-28T13:40:00.000Z",
              total: 326,
              ok: 326,
              failed: 0,
              failedIds: [],
              errorSamples: [],
            },
          };
        },
        limit: createForecastHealthLimiter({ max: 1, windowMs: 60 * 1000 }),
      })
    );

    const server = await listen(app);
    try {
      const { port } = server.address();
      const url = `http://127.0.0.1:${port}/api/health/forecast-freshness`;
      const first = await fetch(url);
      const body = await first.json();
      const second = await fetch(url);
      const limited = await second.json();

      assert.equal(first.status, 200);
      assert.equal(body.ok, true);
      assert.equal(body.staleCount, 0);
      assert.equal(body.lastRun.total, 326);
      assert.equal(body.lastRun.failed, 0);
      assert.equal(reportCalls, 1);
      assert.equal(second.status, 429);
      assert.equal(limited.ok, false);
      assert.equal(limited.error, "rate_limited");
      assert.ok(second.headers.get("retry-after"));
      assertNoSecrets(body);
      assertNoSecrets(limited);
    } finally {
      await new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });

  it("hides checker failures instead of echoing the request URL", async () => {
    const logs = [];
    const original = console.error;
    console.error = (...args) => logs.push(args.join(" "));
    const app = express();
    app.get(
      "/api/health/forecast-freshness",
      createForecastFreshnessHandler({
        getReport: async () => {
          throw new Error(`connect failed ${VC_URL}`);
        },
        limit: () => ({ ok: true }),
      })
    );
    const server = await listen(app);
    try {
      const { port } = server.address();
      const response = await fetch(
        `http://127.0.0.1:${port}/api/health/forecast-freshness`
      );
      const body = await response.json();
      assert.equal(response.status, 500);
      assert.deepEqual(body, { ok: false, error: "freshness_check_failed" });
      assertNoSecrets(body);
      assertNoSecrets(logs.join("\n"));
    } finally {
      console.error = original;
      await new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });

  it("is mounted in public and does not add Visual Crossing calls or touch the storm cron", () => {
    const index = readFileSync(join(root, "index.js"), "utf8");
    const routes = readFileSync(join(root, "api/health.routes.js"), "utf8");
    const cron = readFileSync(join(root, "cron/visualCrossingCron.js"), "utf8");
    const updateWeather = readFileSync(join(root, "utils/updateWeatherData.js"), "utf8");
    const monitor = readFileSync(join(root, "services/forecastMonitor.js"), "utf8");
    const gate = readFileSync(join(root, "utils/stormAlertGate.js"), "utf8");
    const alerts = readFileSync(join(root, "services/weatherAlertService.js"), "utf8");

    assert.match(index, /app\.use\("\/api\/health", healthRouter\)/);
    assert.match(routes, /\/forecast-freshness/);
    assert.match(routes, /createForecastFreshnessHandler/);
    assert.doesNotMatch(routes, /verifyToken|sendEmail|FORECAST_ALERT_EMAIL/);

    assert.match(cron, /30 6 \* \* \*/);
    assert.match(cron, /15 7 \* \* \*/);
    assert.match(cron, /timezone:\s*"MST"/);
    assert.equal(
      cron.match(/updateWeatherData\(\[resort\], fetchVisualCrossing, "visualCrossing"\)/g).length,
      1
    );
    assert.equal((cron.match(/fetchVisualCrossing\(/g) || []).length, 0);
    assert.equal(cron.match(/fetchVisualCrossingAlerts\(/g).length, 1);
    assert.match(cron, /ENABLE_POWDER_ALERT_CRON === "true"/);
    assert.match(cron, /30 14 \* \* \*/);
    assert.doesNotMatch(cron, /ENABLE_POWDER_ALERT_CRON\s*=\s*"true"/);
    assert.match(updateWeather, /summarizeForecastBatch/);
    assert.match(updateWeather, /fetchFn\(resort\.Latitude, resort\.Longitude\)/);
    assert.equal(updateWeather.match(/fetchFn\(/g).length, 1);
    assert.doesNotMatch(monitor, /fetchVisualCrossing|ENABLE_POWDER_ALERT_CRON|weatherAlertService|stormAlertGate/);
    assert.match(gate, /ENABLE_POWDER_ALERT_CRON === "true"/);
    assert.match(alerts, /isPowderAlertCronEnabled/);
  });
});
