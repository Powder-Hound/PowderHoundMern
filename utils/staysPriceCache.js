import NodeCache from "node-cache";
import mongoose from "mongoose";
import "../models/staysSearchCache.model.js";

export function staysCacheTtlSeconds(env = process.env) {
  const ttl = Number(env.DUFFEL_STAYS_CACHE_TTL_SECONDS || 3600);
  if (!Number.isFinite(ttl) || ttl < 30) return 3600;
  return ttl;
}

export function staysCacheKey(query) {
  return [
    query.resort,
    query.check_in,
    query.check_out,
    query.guests,
    query.rooms,
    query.radius,
  ].join("|");
}

export function createStaysPriceCache({
  ttlSeconds = staysCacheTtlSeconds(),
  model = null,
  now = () => new Date(),
} = {}) {
  const memory = new NodeCache({ stdTTL: ttlSeconds, useClones: false });

  function mongoModel() {
    if (model) return model;
    if (mongoose.connection.readyState !== 1) return null;
    return mongoose.models.StaysSearchCache || null;
  }

  return {
    async get(key) {
      const hit = memory.get(key);
      if (hit) return { ...hit, cache_source: "memory" };
      const Model = mongoModel();
      if (!Model) return null;
      try {
        const doc = await Model.findOne({ key }).lean();
        if (!doc?.payload) return null;
        if (doc.expireAt && new Date(doc.expireAt).getTime() <= now().getTime()) return null;
        memory.set(key, doc.payload);
        return { ...doc.payload, cache_source: "mongo" };
      } catch (error) {
        console.error("stays cache read failed", error.message);
        return null;
      }
    },
    async set(key, payload) {
      memory.set(key, payload);
      const Model = mongoModel();
      if (!Model) return payload;
      try {
        const expireAt = new Date(now().getTime() + ttlSeconds * 1000);
        await Model.findOneAndUpdate(
          { key },
          { key, payload, expireAt },
          { upsert: true, new: true }
        );
      } catch (error) {
        console.error("stays cache write failed", error.message);
      }
      return payload;
    },
    reset() {
      memory.flushAll();
    },
  };
}
