/**
 * In-memory sliding-window counter shared by public abuse limits.
 * Per-process only (one Render instance is the usual case).
 * A second instance keeps its own counters.
 */

export const envPositiveInt = (env, key, fallback) => {
  const n = Number.parseInt(env?.[key], 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
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
