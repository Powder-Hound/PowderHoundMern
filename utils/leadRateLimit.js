/**
 * Per-email and per-IP limits for POST /api/leads.
 * In-memory, per process. Unparseable IPs share the "unknown" bucket.
 */

import { createMemoryStore, envPositiveInt } from "./slidingWindowRateLimit.js";

export const LEAD_RATE_LIMITS = {
  email: { max: 5, windowMs: 60 * 60 * 1000 },
  ip: { max: 20, windowMs: 60 * 60 * 1000 },
};

export const DEFAULT_LEAD_DEDUPE_WINDOW_MS = 30 * 60 * 1000;

const defaultStore = createMemoryStore();

export const getLeadRateLimitStore = () => defaultStore;

export const resetLeadRateLimitStore = () => defaultStore.clear();

export const leadLimits = (env = process.env) => ({
  email: {
    max: envPositiveInt(env, "LEAD_EMAIL_MAX", LEAD_RATE_LIMITS.email.max),
    windowMs: envPositiveInt(
      env,
      "LEAD_EMAIL_WINDOW_MS",
      LEAD_RATE_LIMITS.email.windowMs
    ),
  },
  ip: {
    max: envPositiveInt(env, "LEAD_IP_MAX", LEAD_RATE_LIMITS.ip.max),
    windowMs: envPositiveInt(
      env,
      "LEAD_IP_WINDOW_MS",
      LEAD_RATE_LIMITS.ip.windowMs
    ),
  },
});

export const leadDedupeWindowMs = (env = process.env) =>
  envPositiveInt(env, "LEAD_DEDUPE_WINDOW_MS", DEFAULT_LEAD_DEDUPE_WINDOW_MS);

/**
 * Record one attempt. IP is always counted. Email is counted when present.
 * Returns the first exceeded bucket.
 */
export const checkLeadRateLimit = ({
  ip,
  email,
  store = defaultStore,
  env = process.env,
  now = Date.now(),
} = {}) => {
  const limits = leadLimits(env);
  const ipKey = `lead:ip:${ip || "unknown"}`;
  const ipCount = store.hit(ipKey, limits.ip.windowMs, now);
  if (ipCount > limits.ip.max) {
    return {
      ok: false,
      bucket: "ip",
      retryAfterSec: store.retryAfterSec(ipKey, limits.ip.windowMs, now),
    };
  }

  const emailKey = String(email || "").trim();
  if (emailKey) {
    const key = `lead:email:${emailKey}`;
    const emailCount = store.hit(key, limits.email.windowMs, now);
    if (emailCount > limits.email.max) {
      return {
        ok: false,
        bucket: "email",
        retryAfterSec: store.retryAfterSec(key, limits.email.windowMs, now),
      };
    }
  }

  return { ok: true };
};
