import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, it } from "node:test";
import express from "express";
import staysRouter from "../api/stays.routes.js";
import {
  duffelStaysWebhook,
  getStaysFromPrice,
  postStaysHandoff,
  resetStaysOverrides,
  setStaysOverrides,
} from "../controllers/stays.controller.js";
import { LodgingBooking } from "../models/lodgingBooking.model.js";
import { resetStaysRateLimit } from "../middleware/staysRateLimit.js";
import { reconcileDuffelStays } from "../utils/duffelStaysReconcile.js";
import {
  DUFFEL_API_VERSION,
  createDuffelClient,
  quoteCheapestStay,
  selectFromPrice,
  signDuffelPayload,
  verifyDuffelSignature,
} from "../utils/duffelStaysService.js";
import {
  lodgingRecordFromQuote,
  saveLodgingBooking,
  upsertLodgingFromDuffelBooking,
} from "../utils/lodgingBookingStore.js";
import { findResortForStays } from "../utils/resortStaysLookup.js";
import { createStaysPriceCache } from "../utils/staysPriceCache.js";
import {
  bookingsPage,
  confirmedBooking,
  fetchAllRatesResponse,
  linksSessionResponse,
  quoteResponse,
  searchResponse,
} from "./fixtures/duffelStaysFixtures.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envSnapshot = { ...process.env };

let lock = Promise.resolve();
function acquireLock() {
  let release;
  const next = new Promise((resolve) => {
    release = resolve;
  });
  const previous = lock;
  lock = next;
  return previous.then(() => release);
}

function restoreEnv() {
  for (const key of Object.keys(process.env)) {
    if (!(key in envSnapshot)) delete process.env[key];
  }
  Object.assign(process.env, envSnapshot);
}

function memoryModel() {
  const rows = [];
  return {
    rows,
    async create(doc) {
      const row = {
        ...doc,
        webhook_event_ids: doc.webhook_event_ids ? [...doc.webhook_event_ids] : [],
        async save() {
          return row;
        },
      };
      rows.push(row);
      return row;
    },
    async findOne(query) {
      return (
        rows.find((row) =>
          Object.entries(query).every(([key, value]) => row[key] === value)
        ) || null
      );
    },
  };
}

function mockFetch(handler) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({
      url: String(url),
      method: init.method,
      headers: init.headers,
      body: init.body ? JSON.parse(init.body) : null,
    });
    const response = await handler(calls.at(-1));
    return {
      ok: response.status ? response.status < 400 : true,
      status: response.status || 200,
      headers: {
        get(name) {
          const header = String(name).toLowerCase();
          if (header === "content-type") return "application/json";
          if (header === "x-request-id") return response.requestId || "req_test";
          return null;
        },
      },
      async json() {
        return response.body;
      },
    };
  };
  return { fetchImpl, calls };
}

function staysApp() {
  const app = express();
  app.post(
    "/api/stays/webhooks/duffel",
    express.raw({ type: "*/*", limit: "1mb" }),
    duffelStaysWebhook
  );
  app.use(express.json());
  app.use("/api/stays", staysRouter);
  return app;
}

async function perform(app, method, path, { headers = {}, body, raw } = {}) {
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...headers,
      },
      body: raw ?? (body ? JSON.stringify(body) : undefined),
    });
    const text = await response.text();
    return {
      status: response.status,
      json: text ? JSON.parse(text) : null,
      headers: response.headers,
    };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

let releaseLock = () => {};

beforeEach(async () => {
  releaseLock = await acquireLock();
});

afterEach(() => {
  restoreEnv();
  resetStaysOverrides();
  resetStaysRateLimit();
  releaseLock();
});

describe("Duffel token guard and v2 client", () => {
  it("uses Duffel-Version v2 and wraps bodies in data", async () => {
    const { fetchImpl, calls } = mockFetch(async () => ({ body: searchResponse }));
    const client = createDuffelClient({
      token: "duffel_test_example",
      env: { DUFFEL_ALLOW_LIVE: "false" },
      fetchImpl,
    });
    const search = await client.searchStays({
      check_in: "2026-12-18",
      check_out: "2026-12-20",
      guests: 2,
      rooms: 1,
      radius: 10,
      latitude: 41.9684,
      longitude: -111.5417,
    });

    assert.equal(client.apiVersion, DUFFEL_API_VERSION);
    assert.equal(calls[0].headers["Duffel-Version"], "v2");
    assert.equal(calls[0].headers.Authorization, "Bearer duffel_test_example");
    assert.equal(calls[0].method, "POST");
    assert.match(calls[0].url, /\/stays\/search$/);
    assert.deepEqual(calls[0].body.data.guests, [{ type: "adult" }, { type: "adult" }]);
    assert.equal(calls[0].body.data.location.radius, 10);
    assert.equal(calls[0].body.data.location.geographic_coordinates.latitude, 41.9684);
    assert.equal(search.results.length, 3);
    assert.equal(JSON.stringify(calls[0].body).includes("card"), false);
  });

  it("refuses a live token unless DUFFEL_ALLOW_LIVE=true", () => {
    assert.throws(
      () => createDuffelClient({ token: "duffel_live_secret", env: {}, fetchImpl: async () => {} }),
      /non-test token/
    );
    const client = createDuffelClient({
      token: "duffel_live_secret",
      env: { DUFFEL_ALLOW_LIVE: "true" },
      fetchImpl: async () => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => ({ data: {} }) }),
    });
    assert.equal(client.apiVersion, "v2");
  });

  it("quotes the cheapest search result via fetch_all_rates then POST /stays/quotes", async () => {
    const routes = {
      "/stays/search": searchResponse,
      "/stays/search_results/srr_cheapest/actions/fetch_all_rates": fetchAllRatesResponse,
      "/stays/quotes": quoteResponse,
    };
    const { fetchImpl, calls } = mockFetch(async (call) => {
      const path = new URL(call.url).pathname;
      return { body: routes[path] };
    });
    const client = createDuffelClient({
      token: "duffel_test_example",
      env: {},
      fetchImpl,
    });
    const quoted = await quoteCheapestStay(client, {
      check_in: "2026-12-18",
      check_out: "2026-12-20",
      guests: 2,
      rooms: 1,
      radius: 10,
      latitude: 1,
      longitude: 2,
    });

    assert.deepEqual(
      calls.map((call) => new URL(call.url).pathname),
      [
        "/stays/search",
        "/stays/search_results/srr_cheapest/actions/fetch_all_rates",
        "/stays/quotes",
      ]
    );
    assert.equal(calls[2].body.data.rate_id, "rat_low");
    assert.equal(quoted.quote.estimated_commission_amount, "18.95");
    const record = lodgingRecordFromQuote({
      query: { resort: "beaver-mountain", check_in: "2026-12-18", check_out: "2026-12-20", guests: 2, rooms: 1 },
      summary: quoted.summary,
      quote: quoted.quote,
      rate: quoted.rate,
    });
    assert.equal(record.search_id, "srr_cheapest");
    assert.equal(record.quote_id, "quo_0000AS0NZdKjjnnHZmSUbI");
    assert.equal(record.estimated_commission_amount, "18.95");
    assert.equal(record.status, "quoted");
    assert.equal(record.source, "quote");
  });

  it("selects the cheapest amount inside the majority currency", () => {
    const summary = selectFromPrice(searchResponse.data.results);
    assert.equal(summary.from_price, "189.50");
    assert.equal(summary.currency, "USD");
    assert.equal(summary.result_count, 3);
    assert.equal(summary.search_result_id, "srr_cheapest");
  });
});

describe("GET /api/stays/from-price", () => {
  it("returns 404 when ENABLE_DUFFEL_STAYS is not exactly true", async () => {
    process.env.ENABLE_DUFFEL_STAYS = "false";
    const response = await perform(
      staysApp(),
      "GET",
      "/api/stays/from-price?resort=beaver-mountain&check_in=2026-12-18&check_out=2026-12-20&guests=2"
    );
    assert.equal(response.status, 404);
    assert.deepEqual(response.json, { message: "Not found" });
  });

  it("returns the teaser contract from resort coordinates and caches it", async () => {
    process.env.ENABLE_DUFFEL_STAYS = "true";
    process.env.DUFFEL_STAYS_DEFAULT_RADIUS_KM = "12";
    const searches = [];
    const cache = createStaysPriceCache({ ttlSeconds: 60 });
    setStaysOverrides({
      cache,
      now: () => new Date("2026-10-17T01:48:00.000Z"),
      client: {
        async searchStays(params) {
          searches.push(params);
          return searchResponse.data;
        },
      },
    });

    const path =
      "/api/stays/from-price?resort=Beaver%20Mountain&check_in=2026-12-18&check_out=2026-12-20&guests=2";
    const first = await perform(staysApp(), "GET", path);
    const second = await perform(staysApp(), "GET", path);

    assert.equal(first.status, 200);
    assert.deepEqual(Object.keys(first.json).sort(), [
      "cached_at",
      "check_in",
      "check_out",
      "currency",
      "from_price",
      "resort",
      "result_count",
    ]);
    assert.deepEqual(first.json, {
      resort: "beaver-mountain",
      check_in: "2026-12-18",
      check_out: "2026-12-20",
      from_price: "189.50",
      currency: "USD",
      result_count: 3,
      cached_at: "2026-10-17T01:48:00.000Z",
    });
    assert.deepEqual(second.json, first.json);
    assert.equal(searches.length, 1);
    assert.equal(searches[0].latitude, 41.9684);
    assert.equal(searches[0].longitude, -111.5417);
    assert.equal(searches[0].radius, 12);
    assert.equal(searches[0].guests, 2);
    assert.equal(searches[0].rooms, 1);
  });

  it("rate limits repeat teaser calls", async () => {
    process.env.ENABLE_DUFFEL_STAYS = "true";
    process.env.DUFFEL_STAYS_RATE_LIMIT = "1";
    setStaysOverrides({
      cache: createStaysPriceCache(),
      client: { async searchStays() { return { results: [] }; } },
      findResort: async () => ({
        resortName: "Beaver Mountain",
        Latitude: 41.9684,
        Longitude: -111.5417,
      }),
    });
    const path =
      "/api/stays/from-price?resort=beaver-mountain&check_in=2026-12-18&check_out=2026-12-20&guests=1";
    const ok = await perform(staysApp(), "GET", path);
    const limited = await perform(staysApp(), "GET", path);
    assert.equal(ok.status, 200);
    assert.equal(ok.json.from_price, null);
    assert.equal(ok.json.result_count, 0);
    assert.equal(limited.status, 429);
  });
});

describe("POST /api/stays/handoff", () => {
  it("returns a Duffel Links URL scoped to stays and does not forward card data", async () => {
    process.env.ENABLE_DUFFEL_STAYS = "true";
    process.env.DUFFEL_LINKS_SUCCESS_URL = "https://powalert.com/stays/success";
    process.env.DUFFEL_LINKS_FAILURE_URL = "https://powalert.com/stays/failure";
    process.env.DUFFEL_LINKS_ABANDONMENT_URL = "https://powalert.com/stays/abandon";
    const model = memoryModel();
    const sessions = [];
    setStaysOverrides({
      findResort: async () => ({
        resortName: "Beaver Mountain",
        Latitude: 41.9684,
        Longitude: -111.5417,
      }),
      saveBooking: (record) => saveLodgingBooking(record, { model }),
      client: {
        async createLinksSession(session) {
          sessions.push(session);
          return linksSessionResponse.data;
        },
      },
    });

    const response = await perform(staysApp(), "POST", "/api/stays/handoff", {
      body: {
        resort: "beaver-mountain",
        check_in: "2026-12-18",
        check_out: "2026-12-20",
        guests: 2,
        rooms: 1,
        card_number: "4242424242424242",
        cvc: "123",
      },
    });

    assert.equal(response.status, 200);
    assert.equal(response.json.url, "https://links.duffel.com/sessions/ses_test_powalert");
    assert.equal(response.json.provider, "duffel_links");
    assert.equal(response.json.card_capture, false);
    assert.deepEqual(response.json.prefill, { location: false, dates: false });
    assert.equal(response.json.resort, "beaver-mountain");
    assert.match(response.json.reference, /^powalert_beaver-mountain_/);
    assert.equal(sessions[0].success_url, "https://powalert.com/stays/success");
    assert.equal(JSON.stringify(sessions[0]).includes("4242"), false);

    const logged = model.rows[0];
    assert.equal(logged.status, "handoff_created");
    assert.equal(logged.source, "duffel_links");
    assert.equal(logged.links_reference, response.json.reference);
    assert.equal(logged.booking_id, null);
    assert.equal(logged.estimated_commission_amount, null);
  });

  it("posts stays.enabled true and flights.enabled false to /links/sessions", async () => {
    const { fetchImpl, calls } = mockFetch(async () => ({ body: linksSessionResponse }));
    const client = createDuffelClient({
      token: "duffel_test_example",
      env: {},
      fetchImpl,
    });
    const session = await client.createLinksSession({
      reference: "powalert_beaver-mountain_ref",
      success_url: "https://powalert.com/stays/success",
      failure_url: "https://powalert.com/stays/failure",
      abandonment_url: "https://powalert.com/stays/abandon",
      traveller_currency: "USD",
    });
    assert.equal(session.url, linksSessionResponse.data.url);
    assert.equal(calls[0].body.data.stays.enabled, true);
    assert.equal(calls[0].body.data.flights.enabled, false);
    assert.equal(calls[0].body.data.location, undefined);
    assert.equal(calls[0].body.data.check_in_date, undefined);
    assert.match(calls[0].url, /\/links\/sessions$/);
  });
});

describe("webhook and reconciliation", () => {
  it("verifies X-Duffel-Signature and rejects a bad signature", () => {
    const raw = Buffer.from(JSON.stringify({ type: "ping.triggered" }));
    const secret = "54vFWvaSbbzYpxXPeB4YEw==";
    const nowMs = 1_700_000_000_000;
    const header = signDuffelPayload(raw, secret, Math.floor(nowMs / 1000));
    assert.equal(verifyDuffelSignature(raw, header, secret, { nowMs }).ok, true);
    assert.equal(
      verifyDuffelSignature(raw, header.replace(/v1=.*/, "v1=dead"), secret, { nowMs }).ok,
      false
    );
    assert.equal(
      verifyDuffelSignature(raw, header, secret, { nowMs: nowMs + 301_000 }).reason,
      "timestamp_out_of_tolerance"
    );
  });

  it("returns 404 for the webhook when the flag is off", async () => {
    delete process.env.ENABLE_DUFFEL_STAYS;
    const response = await perform(staysApp(), "POST", "/api/stays/webhooks/duffel", {
      raw: "{}",
      headers: { "Content-Type": "application/json" },
    });
    assert.equal(response.status, 404);
  });

  it("records a signed stays.booking.created event against the handoff reference", async () => {
    process.env.ENABLE_DUFFEL_STAYS = "true";
    process.env.DUFFEL_WEBHOOK_SECRET = "test_webhook_secret";
    const model = memoryModel();
    await saveLodgingBooking(
      {
        search_id: null,
        quote_id: null,
        booking_id: null,
        links_reference: "powalert_beaver-mountain_ref",
        resort: "beaver-mountain",
        check_in: "2026-12-18",
        check_out: "2026-12-20",
        status: "handoff_created",
        source: "duffel_links",
        total: null,
        currency: null,
        estimated_commission_amount: null,
      },
      { model }
    );
    setStaysOverrides({
      upsertBooking: (record) => upsertLodgingFromDuffelBooking(record, { model }),
      now: () => new Date("2026-10-17T02:00:00.000Z"),
    });

    const event = {
      id: "wev_0000stays",
      api_version: "v2",
      type: "stays.booking.created",
      live_mode: false,
      idempotency_key: "bok_0000confirmed",
      data: { object: confirmedBooking() },
    };
    const raw = Buffer.from(JSON.stringify(event));
    const header = signDuffelPayload(
      raw,
      process.env.DUFFEL_WEBHOOK_SECRET,
      Math.floor(Date.parse("2026-10-17T02:00:00.000Z") / 1000)
    );
    const response = await perform(staysApp(), "POST", "/api/stays/webhooks/duffel", {
      raw,
      headers: {
        "Content-Type": "application/json",
        "X-Duffel-Signature": header,
      },
    });
    const replay = await perform(staysApp(), "POST", "/api/stays/webhooks/duffel", {
      raw,
      headers: {
        "Content-Type": "application/json",
        "X-Duffel-Signature": header,
      },
    });

    assert.equal(response.status, 200);
    assert.deepEqual(response.json, { received: true });
    assert.equal(replay.status, 200);
    assert.equal(model.rows.length, 1);
    assert.equal(model.rows[0].booking_id, "bok_0000confirmed");
    assert.equal(model.rows[0].status, "confirmed");
    assert.equal(model.rows[0].resort, "beaver-mountain");
    assert.equal(model.rows[0].total, "189.50");
    assert.equal(model.rows[0].currency, "USD");
    assert.equal(model.rows[0].estimated_commission_amount, "18.95");
    assert.equal(model.rows[0].quote_id, "quo_0000AS0NZdKjjnnHZmSUbI");
    assert.deepEqual(model.rows[0].webhook_event_ids, ["wev_0000stays"]);
  });

  it("rejects an unsigned webhook", async () => {
    process.env.ENABLE_DUFFEL_STAYS = "true";
    process.env.DUFFEL_WEBHOOK_SECRET = "test_webhook_secret";
    const response = await perform(staysApp(), "POST", "/api/stays/webhooks/duffel", {
      raw: Buffer.from(JSON.stringify({ type: "stays.booking.created" })),
      headers: { "Content-Type": "application/json", "X-Duffel-Signature": "t=1,v1=nope" },
    });
    assert.equal(response.status, 401);
  });

  it("skips reconciliation unless the flag is on, then upserts confirmed bookings", async () => {
    let called = false;
    const skipped = await reconcileDuffelStays({
      env: { ENABLE_DUFFEL_STAYS: "false" },
      client: { async listBookings() { called = true; return { data: [], meta: null }; } },
    });
    assert.equal(skipped.skipped, true);
    assert.equal(called, false);

    const model = memoryModel();
    const pages = [
      {
        data: bookingsPage.data,
        meta: { after: "cursor_2" },
      },
      {
        data: [confirmedBooking({ id: "bok_page2", metadata: { checkout_reference: "other" } })],
        meta: { after: null },
      },
    ];
    const result = await reconcileDuffelStays({
      env: { ENABLE_DUFFEL_STAYS: "true" },
      client: {
        async listBookings({ after }) {
          return after ? pages[1] : pages[0];
        },
      },
      upsert: (record) => upsertLodgingFromDuffelBooking(record, { model }),
    });

    assert.equal(result.skipped, false);
    assert.equal(result.pages, 2);
    assert.equal(result.seen, 3);
    assert.equal(result.updated, 2);
    assert.deepEqual(
      model.rows.map((row) => row.booking_id).sort(),
      ["bok_0000confirmed", "bok_page2"]
    );
    assert.equal(model.rows.find((row) => row.booking_id === "bok_0000confirmed").source, "reconciliation");
    assert.equal(
      model.rows.find((row) => row.booking_id === "bok_0000confirmed").estimated_commission_amount,
      "18.95"
    );
  });
});

describe("locks and schema", () => {
  it("resolves Beaver Mountain coordinates from resort data", async () => {
    const resort = await findResortForStays("beaver-mountain");
    assert.equal(resort.slug, "beaver-mountain");
    assert.equal(resort.latitude, 41.9684);
    assert.equal(resort.longitude, -111.5417);
  });

  it("validates a lodging_bookings document without a database", async () => {
    const doc = new LodgingBooking({
      search_id: "srr_cheapest",
      quote_id: "quo_0000AS0NZdKjjnnHZmSUbI",
      booking_id: "bok_0000confirmed",
      resort: "beaver-mountain",
      check_in: "2026-12-18",
      check_out: "2026-12-20",
      total: "189.50",
      currency: "USD",
      estimated_commission_amount: "18.95",
      status: "confirmed",
      source: "reconciliation",
    });
    await doc.validate();
    assert.equal(LodgingBooking.collection.collectionName, "lodging_bookings");
  });

  it("keeps lodging off storm SMS, the alert cron, and /go routes", () => {
    const index = readFileSync(join(root, "index.js"), "utf8");
    const rawAt = index.indexOf('"/api/stays/webhooks/duffel"');
    const jsonAt = index.indexOf("app.use(express.json())");
    const staysAt = index.indexOf('app.use("/api/stays"');
    assert.ok(rawAt > 0 && rawAt < jsonAt, "webhook raw body must be registered before json");
    assert.ok(jsonAt < staysAt);

    const locked = [
      "utils/stormAlertGate.js",
      "services/weatherAlertService.js",
      "cron/visualCrossingCron.js",
      "api/auth.routes.js",
      "api/user.routes.js",
      "utils/phone.js",
      "utils/smsUtils.js",
      "utils/twilioService.js",
    ];
    for (const file of locked) {
      const text = readFileSync(join(root, file), "utf8");
      assert.doesNotMatch(text, /duffel|ENABLE_DUFFEL_STAYS|\/api\/stays/i, file);
    }

    const cron = readFileSync(join(root, "cron/visualCrossingCron.js"), "utf8");
    assert.match(cron, /ENABLE_POWDER_ALERT_CRON === "true"/);
    assert.doesNotMatch(cron, /reconcileDuffelStays/);

    const script = readFileSync(join(root, "scripts/reconcileDuffelStays.js"), "utf8");
    assert.match(script, /Not scheduled/);
    assert.match(script, /isDuffelStaysEnabled/);
    const service = readFileSync(join(root, "utils/duffelStaysService.js"), "utf8");
    assert.match(service, /Duffel-Version: v2/);
    assert.doesNotMatch(service, /three_d_secure|card_number|card_id/);
    assert.doesNotMatch(readFileSync(join(root, "controllers/stays.controller.js"), "utf8"), /\/go/);
  });
});

describe("handler exports stay mounted", () => {
  it("does not require auth on the public teaser", () => {
    const routes = readFileSync(join(root, "api/stays.routes.js"), "utf8");
    assert.match(routes, /get\("\/from-price", getStaysFromPrice\)/);
    assert.match(routes, /post\("\/handoff", postStaysHandoff\)/);
    assert.doesNotMatch(routes, /verifyToken/);
    assert.equal(typeof getStaysFromPrice, "function");
    assert.equal(typeof postStaysHandoff, "function");
  });
});
