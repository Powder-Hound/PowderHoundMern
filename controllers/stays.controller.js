import { DuffelStaysError } from "../utils/duffelStaysService.js";
import {
  createDuffelClient,
  createLinksReference,
  isDuffelStaysEnabled,
  linksReturnUrls,
  parseStayQuery,
  selectFromPrice,
  verifyDuffelSignature,
} from "../utils/duffelStaysService.js";
import { findResortForStays } from "../utils/resortStaysLookup.js";
import { createStaysPriceCache, staysCacheKey } from "../utils/staysPriceCache.js";
import { consumeStaysRateLimit } from "../middleware/staysRateLimit.js";
import {
  lodgingRecordFromHandoff,
  lodgingRecordFromDuffelBooking,
  saveLodgingBooking,
  upsertLodgingFromDuffelBooking,
} from "../utils/lodgingBookingStore.js";

const overrides = {
  findResort: null,
  cache: null,
  client: null,
  saveBooking: null,
  upsertBooking: null,
  now: null,
};

let cacheSingleton = null;

export function setStaysOverrides(next) {
  Object.assign(overrides, next);
}

export function resetStaysOverrides() {
  overrides.findResort = null;
  overrides.cache = null;
  overrides.client = null;
  overrides.saveBooking = null;
  overrides.upsertBooking = null;
  overrides.now = null;
  cacheSingleton = null;
}

function cacheFor(env) {
  if (overrides.cache) return overrides.cache;
  if (!cacheSingleton) cacheSingleton = createStaysPriceCache({ env });
  return cacheSingleton;
}

function clientFor(env) {
  if (overrides.client) return overrides.client;
  return createDuffelClient({ env });
}

function sendError(res, error) {
  const status = error?.status || 500;
  res.status(status).json({
    message: error?.message || "Stays request failed",
  });
}

function disabled(res) {
  return res.status(404).json({ message: "Not found" });
}

export async function getStaysFromPrice(req, res) {
  if (!isDuffelStaysEnabled()) return disabled(res);
  const limit = consumeStaysRateLimit(req);
  if (!limit.ok) {
    res.set("Retry-After", String(Math.ceil(limit.retryAfterMs / 1000)));
    return res.status(429).json({ message: "Too many requests" });
  }

  try {
    const query = parseStayQuery(req.query);
    const resort = await findResortForStays(query.resort, {
      findResort: overrides.findResort || undefined,
    });
    if (!resort) return res.status(404).json({ message: "Resort not found" });
    if (resort.latitude == null || resort.longitude == null) {
      return res.status(422).json({ message: "Resort is missing coordinates" });
    }

    const key = staysCacheKey(query);
    const cache = cacheFor(process.env);
    const cached = await cache.get(key);
    if (cached) {
      return res.json({
        resort: cached.resort,
        check_in: cached.check_in,
        check_out: cached.check_out,
        from_price: cached.from_price,
        currency: cached.currency,
        result_count: cached.result_count,
        cached_at: cached.cached_at,
      });
    }

    const search = await clientFor(process.env).searchStays({
      ...query,
      latitude: resort.latitude,
      longitude: resort.longitude,
    });
    const summary = selectFromPrice(search?.results);
    const body = {
      resort: resort.slug,
      check_in: query.check_in,
      check_out: query.check_out,
      from_price: summary.from_price,
      currency: summary.currency,
      result_count: summary.result_count,
      cached_at: (overrides.now ? overrides.now() : new Date()).toISOString(),
    };
    await cache.set(key, body);
    return res.json(body);
  } catch (error) {
    return sendError(res, error);
  }
}

export async function postStaysHandoff(req, res) {
  if (!isDuffelStaysEnabled()) return disabled(res);
  const limit = consumeStaysRateLimit(req);
  if (!limit.ok) {
    res.set("Retry-After", String(Math.ceil(limit.retryAfterMs / 1000)));
    return res.status(429).json({ message: "Too many requests" });
  }

  try {
    const query = parseStayQuery({ ...req.query, ...req.body });
    const resort = await findResortForStays(query.resort, {
      findResort: overrides.findResort || undefined,
    });
    if (!resort) return res.status(404).json({ message: "Resort not found" });

    const reference = createLinksReference(resort.slug);
    const urls = linksReturnUrls();
    const session = await clientFor(process.env).createLinksSession({
      reference,
      ...urls,
      traveller_currency: process.env.DUFFEL_LINKS_TRAVELLER_CURRENCY || "USD",
      logo_url: process.env.DUFFEL_LINKS_LOGO_URL || undefined,
      primary_color: process.env.DUFFEL_LINKS_PRIMARY_COLOR || undefined,
    });

    const url = session?.url;
    if (!url || typeof url !== "string") {
      throw new DuffelStaysError("Duffel Links did not return a hosted URL", {
        status: 502,
        code: "links_url_missing",
      });
    }

    const record = lodgingRecordFromHandoff({ query: { ...query, resort: resort.slug }, reference });
    try {
      const save = overrides.saveBooking || saveLodgingBooking;
      await save(record);
    } catch (error) {
      console.error("lodging handoff log failed", error.message);
    }

    return res.json({
      resort: resort.slug,
      check_in: query.check_in,
      check_out: query.check_out,
      guests: query.guests,
      rooms: query.rooms,
      url,
      reference,
      provider: "duffel_links",
      card_capture: false,
      prefill: {
        location: false,
        dates: false,
      },
    });
  } catch (error) {
    return sendError(res, error);
  }
}

export async function duffelStaysWebhook(req, res) {
  if (!isDuffelStaysEnabled()) return disabled(res);

  const secret = process.env.DUFFEL_WEBHOOK_SECRET;
  if (!secret) {
    return res.status(503).json({ message: "DUFFEL_WEBHOOK_SECRET is not configured" });
  }

  const rawBody = Buffer.isBuffer(req.body)
    ? req.body
    : Buffer.from(typeof req.body === "string" ? req.body : "", "utf8");
  const header = req.get?.("X-Duffel-Signature") || req.headers?.["x-duffel-signature"];
  const tolerance = Number(process.env.DUFFEL_WEBHOOK_TOLERANCE_SECONDS ?? 300);
  const verified = verifyDuffelSignature(rawBody, header, secret, {
    nowMs: overrides.now ? overrides.now().getTime() : Date.now(),
    toleranceSeconds: Number.isFinite(tolerance) ? tolerance : 300,
  });
  if (!verified.ok) {
    return res.status(401).json({ message: "Invalid signature" });
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString("utf8"));
  } catch {
    return res.status(400).json({ message: "Invalid JSON" });
  }

  const type = event?.type;
  const handled = new Set([
    "stays.booking.created",
    "stays.booking.cancelled",
    "stays.booking_creation_failed",
    "ping.triggered",
  ]);
  if (!handled.has(type)) {
    return res.json({ received: true });
  }
  if (type === "ping.triggered") {
    return res.json({ received: true });
  }

  const booking = event?.data?.object;
  if (!booking || typeof booking !== "object") {
    return res.status(400).json({ message: "Missing booking object" });
  }

  const record = lodgingRecordFromDuffelBooking(booking, {
    source: "duffel_webhook",
    eventId: event.id || event.idempotency_key || null,
    liveMode: event.live_mode ?? null,
  });
  if (type === "stays.booking_creation_failed") {
    record.status = booking.status || "failed";
  }

  try {
    const upsert = overrides.upsertBooking || upsertLodgingFromDuffelBooking;
    await upsert(record);
  } catch (error) {
    console.error("lodging webhook log failed", error.message);
    return res.status(500).json({ message: "Failed to record booking" });
  }

  return res.json({ received: true });
}
