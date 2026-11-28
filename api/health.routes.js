import express from "express";
import { clientIp } from "../utils/clientIp.js";
import { createMemoryStore } from "../utils/otpRateLimit.js";
import { sanitizeForecastError } from "../utils/forecastIngestSummary.js";
import {
  buildFreshnessPayload,
} from "../utils/forecastFreshness.js";
import { getForecastFreshnessReport } from "../services/forecastMonitor.js";

/**
 * Public forecast health. Same in-memory sliding window as the OTP limiter,
 * with its own IP bucket so these reads do not consume OTP quota.
 */
export const FORECAST_HEALTH_RATE_LIMIT = {
  max: 60,
  windowMs: 60 * 1000,
};

export function createForecastHealthLimiter({
  store = createMemoryStore(),
  max = FORECAST_HEALTH_RATE_LIMIT.max,
  windowMs = FORECAST_HEALTH_RATE_LIMIT.windowMs,
  now = () => Date.now(),
} = {}) {
  return function limitForecastHealth(req) {
    const key = `forecast-freshness:ip:${clientIp(req)}`;
    const count = store.hit(key, windowMs, now());
    if (count > max) {
      return {
        ok: false,
        retryAfterSec: store.retryAfterSec(key, windowMs, now()),
      };
    }
    return { ok: true };
  };
}

const forecastHealthLimiter = createForecastHealthLimiter();

export function createForecastFreshnessHandler({
  getReport,
  limit = forecastHealthLimiter,
} = {}) {
  if (typeof getReport !== "function") {
    throw new Error("forecast freshness handler requires getReport");
  }

  return async (req, res) => {
    const limited = limit(req);
    if (!limited.ok) {
      res.set("Retry-After", String(limited.retryAfterSec));
      return res.status(429).json({ ok: false, error: "rate_limited" });
    }

    try {
      const report = await getReport();
      return res.status(200).json(buildFreshnessPayload(report));
    } catch (err) {
      console.error(
        "forecast freshness check failed:",
        sanitizeForecastError(err)
      );
      return res.status(500).json({ ok: false, error: "freshness_check_failed" });
    }
  };
}

const healthRouter = express.Router();

/**
 * @swagger
 * /api/health/forecast-freshness:
 *   get:
 *     tags: [Weather]
 *     summary: Public forecast ingest freshness (no secrets, no per-user data)
 *     responses:
 *       200:
 *         description: Last ingest summary and stale-resort count
 *       429:
 *         description: Rate limited
 */
healthRouter.get(
  "/forecast-freshness",
  createForecastFreshnessHandler({
    getReport: () => getForecastFreshnessReport(),
  })
);

export default healthRouter;
