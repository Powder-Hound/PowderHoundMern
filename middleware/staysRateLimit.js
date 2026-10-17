const buckets = new Map();

export function staysRateLimitConfig(env = process.env) {
  const max = Number(env.DUFFEL_STAYS_RATE_LIMIT || 20);
  const windowMs = Number(env.DUFFEL_STAYS_RATE_WINDOW_MS || 60_000);
  return {
    max: Number.isFinite(max) && max > 0 ? max : 20,
    windowMs: Number.isFinite(windowMs) && windowMs > 0 ? windowMs : 60_000,
  };
}

export function resetStaysRateLimit() {
  buckets.clear();
}

export function consumeStaysRateLimit(req, env = process.env, now = Date.now()) {
  const { max, windowMs } = staysRateLimitConfig(env);
  const ip = req.ip || req.headers?.["x-forwarded-for"] || "unknown";
  const key = `${ip}:${req.path || req.url || ""}`;
  const bucket = buckets.get(key);
  if (!bucket || now - bucket.start >= windowMs) {
    buckets.set(key, { start: now, count: 1 });
    return { ok: true, remaining: max - 1 };
  }
  if (bucket.count >= max) {
    return { ok: false, remaining: 0, retryAfterMs: windowMs - (now - bucket.start) };
  }
  bucket.count += 1;
  return { ok: true, remaining: max - bucket.count };
}
