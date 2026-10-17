/**
 * Duffel Stays client for PowAlert lodging teasers and Links handoff.
 *
 * API version header: Duffel-Version: v2
 * Docs:
 *   https://duffel.com/docs/api/overview/making-requests
 *   https://duffel.com/docs/guides/getting-started-with-stays
 *   https://duffel.com/docs/api/v2/search
 *   https://duffel.com/docs/api/v2/search-result/fetch-all-rates
 *   https://duffel.com/docs/api/v2/quotes/create-quote
 *   https://duffel.com/docs/api/v2/bookings/list-bookings
 *   https://duffel.com/docs/guides/duffel-links
 *   https://duffel.com/docs/guides/receiving-webhooks
 *
 * PowAlert never sends card data. Booking payment happens on Duffel's hosted
 * Links checkout (stays.enabled). This module does not call POST /stays/bookings.
 */

import crypto from "node:crypto";
import { resortNameToSlug } from "./segmentPredicates.js";

export const DUFFEL_API_VERSION = "v2";
export const DUFFEL_API_BASE_URL = "https://api.duffel.com";
export const DEFAULT_STAYS_RADIUS_KM = 10;
export const MAX_STAYS_RADIUS_KM = 50;
export const MAX_STAY_NIGHTS = 99;
export const MAX_CHECKIN_LEAD_DAYS = 330;
export const WEBHOOK_TOLERANCE_SECONDS = 300;

const COMPLETED_BOOKING_STATUS = "confirmed";

export class DuffelStaysError extends Error {
  constructor(message, { status = 500, code = "duffel_stays_error" } = {}) {
    super(message);
    this.name = "DuffelStaysError";
    this.status = status;
    this.code = code;
  }
}

export function isDuffelStaysEnabled(env = process.env) {
  return env.ENABLE_DUFFEL_STAYS === "true";
}

export function assertDuffelTokenAllowed(token, env = process.env) {
  const value = String(token ?? "").trim();
  if (!value) {
    throw new DuffelStaysError("DUFFEL_ACCESS_TOKEN is not configured", {
      status: 503,
      code: "duffel_token_missing",
    });
  }
  if (!value.startsWith("duffel_test_") && env.DUFFEL_ALLOW_LIVE !== "true") {
    throw new DuffelStaysError(
      "Refusing to call Duffel with a non-test token. Set DUFFEL_ALLOW_LIVE=true only when a live token is intentional.",
      { status: 503, code: "duffel_live_token_refused" }
    );
  }
  return value;
}

function badRequest(message) {
  return new DuffelStaysError(message, { status: 400, code: "invalid_stay_query" });
}

export function parseIsoDate(value) {
  const text = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const [year, month, day] = text.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

export function nightsBetween(checkIn, checkOut) {
  return Math.round((checkOut.getTime() - checkIn.getTime()) / 86400000);
}

export function parseStayQuery(input, env = process.env) {
  const resort = resortNameToSlug(input?.resort);
  if (!resort) throw badRequest("resort is required");

  const checkInDate = parseIsoDate(input?.check_in);
  const checkOutDate = parseIsoDate(input?.check_out);
  if (!checkInDate || !checkOutDate) {
    throw badRequest("check_in and check_out must be YYYY-MM-DD dates");
  }
  const nights = nightsBetween(checkInDate, checkOutDate);
  if (nights < 1) throw badRequest("check_out must be after check_in");
  if (nights > MAX_STAY_NIGHTS) {
    throw badRequest(`stay cannot exceed ${MAX_STAY_NIGHTS} nights`);
  }

  const today = new Date();
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const leadDays = Math.round((checkInDate.getTime() - todayUtc) / 86400000);
  if (leadDays < 0) throw badRequest("check_in cannot be in the past");
  if (leadDays > MAX_CHECKIN_LEAD_DAYS) {
    throw badRequest(`check_in cannot be more than ${MAX_CHECKIN_LEAD_DAYS} days ahead`);
  }

  const guests = Number(input?.guests);
  if (!Number.isInteger(guests) || guests < 1 || guests > 16) {
    throw badRequest("guests must be an integer from 1 to 16");
  }
  const rooms =
    input?.rooms == null || input?.rooms === "" ? 1 : Number(input.rooms);
  if (!Number.isInteger(rooms) || rooms < 1 || rooms > 8) {
    throw badRequest("rooms must be an integer from 1 to 8");
  }
  if (guests < rooms) {
    throw badRequest("guests must be at least the number of rooms");
  }

  let radius = Number(env.DUFFEL_STAYS_DEFAULT_RADIUS_KM || DEFAULT_STAYS_RADIUS_KM);
  if (input?.radius != null && input.radius !== "") radius = Number(input.radius);
  if (!Number.isFinite(radius) || radius < 1 || radius > MAX_STAYS_RADIUS_KM) {
    throw badRequest(`radius must be between 1 and ${MAX_STAYS_RADIUS_KM} km`);
  }

  return {
    resort,
    check_in: String(input.check_in).trim(),
    check_out: String(input.check_out).trim(),
    guests,
    rooms,
    radius,
  };
}

export function buildGuestList(guests) {
  return Array.from({ length: guests }, () => ({ type: "adult" }));
}

export function formatAmount(amount) {
  if (amount == null || amount === "") return null;
  const text = String(amount).trim();
  if (/^\d+\.\d{2}$/.test(text)) return text;
  const numeric = Number(text);
  if (!Number.isFinite(numeric)) return null;
  return numeric.toFixed(2);
}

/**
 * cheapest_rate_total_amount is the accurate from-price on search.
 * Mixed currencies are not comparable, so the teaser uses the currency
 * that appears on the most results (ties broken by currency code).
 */
export function selectFromPrice(results) {
  const rows = Array.isArray(results) ? results : [];
  const priced = rows.filter(
    (row) =>
      row &&
      row.cheapest_rate_total_amount != null &&
      row.cheapest_rate_currency &&
      Number.isFinite(Number(row.cheapest_rate_total_amount))
  );
  if (!priced.length) {
    return {
      from_price: null,
      currency: null,
      result_count: rows.length,
      search_result_id: null,
    };
  }

  const counts = new Map();
  for (const row of priced) {
    const currency = String(row.cheapest_rate_currency);
    counts.set(currency, (counts.get(currency) || 0) + 1);
  }
  const currency = [...counts.entries()].sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return a[0].localeCompare(b[0]);
  })[0][0];

  let best = null;
  for (const row of priced) {
    if (row.cheapest_rate_currency !== currency) continue;
    if (!best || Number(row.cheapest_rate_total_amount) < Number(best.cheapest_rate_total_amount)) {
      best = row;
    }
  }

  return {
    from_price: formatAmount(best.cheapest_rate_total_amount),
    currency,
    result_count: rows.length,
    search_result_id: best.id || null,
  };
}

export function cheapestRate(searchResult) {
  const rates = [];
  for (const room of searchResult?.accommodation?.rooms || []) {
    for (const rate of room?.rates || []) {
      if (rate?.id && rate.total_amount != null) rates.push(rate);
    }
  }
  rates.sort((a, b) => Number(a.total_amount) - Number(b.total_amount));
  return rates[0] || null;
}

export function extractCommission(source) {
  if (!source || typeof source !== "object") {
    return { estimated_commission_amount: null, estimated_commission_currency: null };
  }
  if (source.estimated_commission_amount != null) {
    return {
      estimated_commission_amount: formatAmount(source.estimated_commission_amount),
      estimated_commission_currency: source.estimated_commission_currency || null,
    };
  }
  const rate = cheapestRate(source);
  return {
    estimated_commission_amount: formatAmount(rate?.estimated_commission_amount),
    estimated_commission_currency: rate?.estimated_commission_currency || null,
  };
}

export function bookingTotal(booking) {
  if (booking?.total_amount != null) {
    return {
      total: formatAmount(booking.total_amount),
      currency: booking.total_currency || null,
    };
  }
  const rate = cheapestRate(booking);
  return {
    total: formatAmount(rate?.total_amount),
    currency: rate?.total_currency || null,
  };
}

export function isCompletedStayBooking(booking) {
  return booking?.status === COMPLETED_BOOKING_STATUS;
}

function requestIdFrom(headers) {
  if (!headers || typeof headers.get !== "function") return null;
  return headers.get("x-request-id");
}

async function readJson(response) {
  const contentType = response.headers?.get?.("content-type") || "";
  if (contentType.includes("json") || !contentType) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }
  return null;
}

export function createDuffelClient({
  env = process.env,
  fetchImpl = globalThis.fetch,
  token = env.DUFFEL_ACCESS_TOKEN,
  baseUrl = env.DUFFEL_API_BASE_URL || DUFFEL_API_BASE_URL,
} = {}) {
  if (typeof fetchImpl !== "function") {
    throw new DuffelStaysError("fetch is not available", {
      status: 500,
      code: "fetch_missing",
    });
  }

  const accessToken = assertDuffelTokenAllowed(token, env);

  async function request({ method, path, data, query }) {
    const url = new URL(path, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value != null && value !== "") url.searchParams.set(key, String(value));
      }
    }

    const headers = {
      Accept: "application/json",
      "Accept-Encoding": "gzip",
      "Content-Type": "application/json",
      "Duffel-Version": DUFFEL_API_VERSION,
      Authorization: `Bearer ${accessToken}`,
    };

    const init = { method, headers };
    if (data !== undefined) init.body = JSON.stringify({ data });

    let response;
    try {
      response = await fetchImpl(url, init);
    } catch (error) {
      console.error("Duffel stays network error", error?.message || error);
      throw new DuffelStaysError("Duffel stays request failed", {
        status: 502,
        code: "duffel_network",
      });
    }

    const body = await readJson(response);
    if (!response.ok || (body && Array.isArray(body.errors) && body.errors.length)) {
      const requestId = requestIdFrom(response.headers);
      console.error(
        "Duffel stays error",
        response.status,
        requestId || "",
        body?.errors?.[0]?.code || ""
      );
      throw new DuffelStaysError("Duffel stays request failed", {
        status: 502,
        code: body?.errors?.[0]?.code || "duffel_error",
      });
    }

    return body || {};
  }

  return {
    apiVersion: DUFFEL_API_VERSION,
    async searchStays(params) {
      const body = await request({
        method: "POST",
        path: "/stays/search",
        data: {
          check_in_date: params.check_in,
          check_out_date: params.check_out,
          rooms: params.rooms,
          guests: buildGuestList(params.guests),
          location: {
            radius: params.radius,
            geographic_coordinates: {
              latitude: params.latitude,
              longitude: params.longitude,
            },
          },
        },
      });
      return body.data;
    },
    async fetchAllRates(searchResultId) {
      const id = encodeURIComponent(searchResultId);
      const body = await request({
        method: "POST",
        path: `/stays/search_results/${id}/actions/fetch_all_rates`,
      });
      return body.data;
    },
    async createQuote(rateId) {
      const body = await request({
        method: "POST",
        path: "/stays/quotes",
        data: { rate_id: rateId },
      });
      return body.data;
    },
    /**
     * Duffel Links hosted search + checkout. Published schema (guide curl)
     * accepts stays.enabled and flights.enabled. It does not document
     * geographic coordinates, dates, guests, or rooms on the session.
     * open_path exists for a known accommodation id, but Duffel has not
     * published the path format, so we do not send it.
     */
    async createLinksSession(session) {
      const data = {
        reference: session.reference,
        success_url: session.success_url,
        failure_url: session.failure_url,
        abandonment_url: session.abandonment_url,
        traveller_currency: session.traveller_currency || "USD",
        flights: { enabled: false },
        stays: { enabled: true },
      };
      if (session.logo_url) data.logo_url = session.logo_url;
      if (session.primary_color) data.primary_color = session.primary_color;
      const body = await request({
        method: "POST",
        path: "/links/sessions",
        data,
      });
      return body.data;
    },
    async listBookings({ limit = 50, after } = {}) {
      const body = await request({
        method: "GET",
        path: "/stays/bookings",
        query: { limit, after },
      });
      return { data: body.data || [], meta: body.meta || null };
    },
  };
}

export async function quoteCheapestStay(client, params) {
  const search = await client.searchStays(params);
  const summary = selectFromPrice(search?.results);
  if (!summary.search_result_id) {
    return { search, summary, rate: null, quote: null };
  }
  const full = await client.fetchAllRates(summary.search_result_id);
  const rate = cheapestRate(full);
  if (!rate) {
    throw new DuffelStaysError("Duffel returned a stay with no bookable rate", {
      status: 502,
      code: "no_rates",
    });
  }
  const quote = await client.createQuote(rate.id);
  return { search, summary, full, rate, quote };
}

export function linksReturnUrls(env = process.env) {
  const explicit = {
    success_url: env.DUFFEL_LINKS_SUCCESS_URL,
    failure_url: env.DUFFEL_LINKS_FAILURE_URL,
    abandonment_url: env.DUFFEL_LINKS_ABANDONMENT_URL,
  };
  if (explicit.success_url && explicit.failure_url && explicit.abandonment_url) {
    return explicit;
  }

  let origin = "https://powalert.com";
  const candidate = env.DUFFEL_LINKS_RETURN_BASE || env.ORIGIN;
  if (candidate) {
    try {
      const parsed = new URL(candidate);
      if (parsed.protocol === "https:" || parsed.protocol === "http:") {
        origin = parsed.origin;
      }
    } catch {
      origin = "https://powalert.com";
    }
  }

  return {
    success_url: explicit.success_url || `${origin}/stays/success`,
    failure_url: explicit.failure_url || `${origin}/stays/failure`,
    abandonment_url: explicit.abandonment_url || `${origin}/stays/abandon`,
  };
}

export function createLinksReference(resortSlug) {
  const stamp = Date.now().toString(36);
  const nonce = crypto.randomBytes(4).toString("hex");
  return `powalert_${resortSlug}_${stamp}_${nonce}`.slice(0, 180);
}

/**
 * Verify X-Duffel-Signature: t=<unix>,v1=<lowercase hex hmac-sha256>.
 * Signed payload is `${timestamp}.${rawBody}` keyed with the webhook secret.
 * https://duffel.com/docs/guides/receiving-webhooks
 */
export function verifyDuffelSignature(
  rawBody,
  header,
  secret,
  { nowMs = Date.now(), toleranceSeconds = WEBHOOK_TOLERANCE_SECONDS } = {}
) {
  if (!secret) return { ok: false, reason: "missing_secret" };
  if (!header || rawBody == null) return { ok: false, reason: "missing_signature" };

  const pairs = String(header)
    .split(",")
    .map((part) => {
      const index = part.indexOf("=");
      if (index === -1) return null;
      return [part.slice(0, index).trim(), part.slice(index + 1).trim()];
    })
    .filter(Boolean);

  const timestamp = pairs.find(([key]) => key === "t")?.[1];
  const signatures = pairs.filter(([key]) => key === "v1").map(([, value]) => value);
  if (!timestamp || !/^\d+$/.test(timestamp) || signatures.length === 0) {
    return { ok: false, reason: "invalid_format" };
  }

  const ageSeconds = Math.abs(nowMs / 1000 - Number(timestamp));
  if (toleranceSeconds >= 0 && ageSeconds > toleranceSeconds) {
    return { ok: false, reason: "timestamp_out_of_tolerance" };
  }

  const payload = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody));
  const signed = Buffer.concat([Buffer.from(`${timestamp}.`), payload]);
  const expected = crypto.createHmac("sha256", secret).update(signed).digest("hex");
  const expectedBuf = Buffer.from(expected, "utf8");

  const match = signatures.some((candidate) => {
    const actual = Buffer.from(String(candidate), "utf8");
    if (actual.length !== expectedBuf.length) return false;
    return crypto.timingSafeEqual(actual, expectedBuf);
  });

  return match ? { ok: true, timestamp } : { ok: false, reason: "invalid_signature" };
}

export function signDuffelPayload(rawBody, secret, timestampSeconds) {
  const payload = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody));
  const signed = Buffer.concat([
    Buffer.from(`${timestampSeconds}.`),
    payload,
  ]);
  const digest = crypto.createHmac("sha256", secret).update(signed).digest("hex");
  return `t=${timestampSeconds},v1=${digest}`;
}
