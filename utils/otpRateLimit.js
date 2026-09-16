/**
 * In-memory sliding-window rate limits for public OTP routes.
 * Per-process only (Render single instance is the usual case).
 * Fail closed: unparseable IP uses the "unknown" bucket.
 */

export const OTP_RATE_LIMITS = {
  send: {
    phone: { max: 3, windowMs: 10 * 60 * 1000 },
    ip: { max: 8, windowMs: 10 * 60 * 1000 },
  },
  verify: {
    phone: { max: 8, windowMs: 10 * 60 * 1000 },
    ip: { max: 25, windowMs: 10 * 60 * 1000 },
  },
  validate: {
    phone: { max: 10, windowMs: 10 * 60 * 1000 },
    ip: { max: 20, windowMs: 10 * 60 * 1000 },
  },
};

const envInt = (env, key, fallback) => {
  const n = Number.parseInt(env?.[key], 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export const limitsForAction = (action, env = process.env) => {
  const defaults = OTP_RATE_LIMITS[action] || OTP_RATE_LIMITS.send;
  const prefix =
    action === "verify"
      ? "OTP_VERIFY"
      : action === "validate"
        ? "OTP_VALIDATE"
        : "OTP_SEND";
  return {
    phone: {
      max: envInt(env, `${prefix}_PHONE_MAX`, defaults.phone.max),
      windowMs: envInt(env, `${prefix}_PHONE_WINDOW_MS`, defaults.phone.windowMs),
    },
    ip: {
      max: envInt(env, `${prefix}_IP_MAX`, defaults.ip.max),
      windowMs: envInt(env, `${prefix}_IP_WINDOW_MS`, defaults.ip.windowMs),
    },
  };
};

export const createMemoryStore = () => {
  const buckets = new Map();

  const prune = (key, windowMs, now) => {
    const hits = buckets.get(key);
    if (!hits) return [];
    const fresh = hits.filter((ts) => now - ts < windowMs);
    if (fresh.length) buckets.set(key, fresh);
    else buckets.delete(key);
    return fresh;
  };

  return {
    hit(key, windowMs, now = Date.now()) {
      const fresh = prune(key, windowMs, now);
      fresh.push(now);
      buckets.set(key, fresh);
      return fresh.length;
    },
    count(key, windowMs, now = Date.now()) {
      return prune(key, windowMs, now).length;
    },
    retryAfterSec(key, windowMs, now = Date.now()) {
      const hits = buckets.get(key) || [];
      const oldest = hits[0];
      if (!oldest) return 1;
      return Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
    },
    clear() {
      buckets.clear();
    },
    get size() {
      return buckets.size;
    },
  };
};

const defaultStore = createMemoryStore();

export const resetOtpRateLimitStore = () => defaultStore.clear();

export const getOtpRateLimitStore = () => defaultStore;

/**
 * Record one attempt against IP (always) and phone (when present).
 * Returns the first exceeded bucket, or ok.
 */
export const checkOtpRateLimit = ({
  action,
  ip,
  phone,
  store = defaultStore,
  env = process.env,
  now = Date.now(),
} = {}) => {
  const limits = limitsForAction(action, env);
  const ipKey = `otp:${action}:ip:${ip || "unknown"}`;
  const ipCount = store.hit(ipKey, limits.ip.windowMs, now);
  if (ipCount > limits.ip.max) {
    return {
      ok: false,
      bucket: "ip",
      retryAfterSec: store.retryAfterSec(ipKey, limits.ip.windowMs, now),
    };
  }

  if (phone) {
    const phoneKey = `otp:${action}:phone:${phone}`;
    const phoneCount = store.hit(phoneKey, limits.phone.windowMs, now);
    if (phoneCount > limits.phone.max) {
      return {
        ok: false,
        bucket: "phone",
        retryAfterSec: store.retryAfterSec(phoneKey, limits.phone.windowMs, now),
      };
    }
  }

  return { ok: true };
};
