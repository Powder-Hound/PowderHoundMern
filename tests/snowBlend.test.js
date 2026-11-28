import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { fetchJsonWithRetry } from "../utils/httpRetry.js";
import {
  bucketQuantitativeValues,
  formatNwsCoordinate,
  nwsDailyInches,
} from "../utils/nwsSnow.js";
import {
  applyBlendToForecast,
  attributionForForecast,
  buildBlend,
  roundSnowInches,
} from "../utils/snowBlend.js";
import { fetchNwsSnow, nwsUserAgent } from "../externalAPI/nwsAPI.js";
import {
  fetchOpenMeteoSnow,
  isOpenMeteoEnabled,
  parseOpenMeteoDaily,
} from "../externalAPI/openMeteoAPI.js";
import { runSnowBlendIngest } from "../utils/snowBlendIngest.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function closeTo(actual, expected) {
  assert.ok(
    Math.abs(actual - expected) < 1e-9,
    `expected ${expected} but got ${actual}`
  );
}

function httpResult(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
    async text() {
      return typeof body === "string" ? body : JSON.stringify(body ?? {});
    },
  };
}

describe("NWS local-day bucketing", () => {
  it("splits an ISO-8601 duration that crosses local midnight", () => {
    const denver = bucketQuantitativeValues(
      [{ validTime: "2026-11-29T05:00:00+00:00/PT3H", value: 3 }],
      "America/Denver"
    );
    assert.equal(denver.length, 2);
    assert.equal(denver[0].date, "2026-11-28");
    assert.equal(denver[1].date, "2026-11-29");
    closeTo(denver[0].amount, 2);
    closeTo(denver[1].amount, 1);

    const eastern = bucketQuantitativeValues(
      [{ validTime: "2026-11-29T05:00:00+00:00/PT3H", value: 3 }],
      "America/New_York"
    );
    assert.deepEqual(
      eastern.map((bucket) => bucket.date),
      ["2026-11-29"]
    );
    closeTo(eastern[0].amount, 3);
  });

  it("keeps a period that stays inside one local day on that day", () => {
    const buckets = bucketQuantitativeValues(
      [{ validTime: "2026-11-28T15:00:00+00:00/PT1H", value: 4 }],
      "America/Denver"
    );
    assert.equal(buckets.length, 1);
    assert.equal(buckets[0].date, "2026-11-28");
    closeTo(buckets[0].amount, 4);
  });
});

describe("snow blend median, low, and high", () => {
  it("sets low, high, and median to the only value when n is 1", () => {
    const built = buildBlend([
      { source: "visualCrossing", inches: 0.8, issuedAt: "2026-11-28T13:30:00.000Z" },
    ]);
    assert.equal(built.blend.n, 1);
    assert.equal(built.blend.singleSource, true);
    assert.equal(built.blend.median, 0.8);
    assert.equal(built.blend.low, 0.8);
    assert.equal(built.blend.high, 0.8);
    assert.deepEqual(built.blend.sources, ["visualCrossing"]);
    assert.equal(built.snowSources[0].issuedAt, "2026-11-28T13:30:00.000Z");
  });

  it("uses the mean of the two values when n is 2", () => {
    const built = buildBlend([
      { source: "nws", inches: 4, issuedAt: "2026-11-28T06:31:26+00:00" },
      { source: "visualCrossing", inches: 1, issuedAt: "2026-11-28T13:30:00.000Z" },
    ]);
    assert.equal(built.blend.n, 2);
    assert.equal(built.blend.singleSource, false);
    assert.equal(built.blend.low, 1);
    assert.equal(built.blend.high, 4);
    assert.equal(built.blend.median, 2.5);
    assert.deepEqual(built.blend.sources, ["visualCrossing", "nws"]);
  });

  it("uses the mean of the two central values when n is 4", () => {
    const built = buildBlend([
      { source: "visualCrossing", inches: 0, issuedAt: "t" },
      { source: "nws", inches: 1, issuedAt: "t" },
      { source: "open-meteo:gfs", inches: 2, issuedAt: "t" },
      { source: "open-meteo:ecmwf", inches: 9, issuedAt: "t" },
    ]);
    assert.equal(built.blend.n, 4);
    assert.equal(built.blend.singleSource, false);
    assert.equal(built.blend.low, 0);
    assert.equal(built.blend.high, 9);
    assert.equal(built.blend.median, 1.5);
  });

  it("keeps snow.value and marks later days single-source when only Visual Crossing is present", () => {
    const forecast = applyBlendToForecast(
      [
        { validTime: "2026-11-28", snow: { value: 2.54, snowDepth: 8 }, conditions: "Snow" },
        { validTime: "2026-12-06", snow: { value: 5.08, snowDepth: 9 }, conditions: "Snow" },
      ],
      {
        uom: "metric",
        vcIssuedAt: "2026-11-28T13:30:00.000Z",
        extrasByDate: new Map([
          ["2026-11-28", [{ source: "nws", inches: 4, issuedAt: "2026-11-28T06:31:26+00:00" }]],
        ]),
      }
    );
    assert.equal(forecast[0].snow.value, 2.54);
    assert.equal(forecast[0].snow.snowDepth, 8);
    assert.equal(forecast[0].conditions, "Snow");
    assert.equal(forecast[0].blend.n, 2);
    assert.equal(forecast[0].blend.singleSource, false);
    assert.equal(forecast[0].blend.low, 1);
    assert.equal(forecast[0].blend.high, 4);
    assert.equal(forecast[0].blend.median, 2.5);
    assert.equal(forecast[1].snow.value, 5.08);
    assert.equal(forecast[1].blend.n, 1);
    assert.equal(forecast[1].blend.singleSource, true);
    assert.equal(forecast[1].blend.low, 2);
    assert.equal(forecast[1].blend.high, 2);
    assert.equal(forecast[1].blend.median, 2);
    assert.deepEqual(forecast[1].blend.sources, ["visualCrossing"]);
  });
});

describe("Open-Meteo flag", () => {
  it("makes no request when the flag is off, including when a key is present", async () => {
    for (const env of [
      {},
      { ENABLE_OPEN_METEO: "false" },
      { ENABLE_OPEN_METEO: "TRUE" },
      { ENABLE_OPEN_METEO: "1" },
      { OPEN_METEO_API_KEY: "test-key" },
      { ENABLE_OPEN_METEO: "false", OPEN_METEO_API_KEY: "test-key" },
    ]) {
      let fetches = 0;
      const result = await fetchOpenMeteoSnow({
        lat: 40.6443,
        lon: -111.5385,
        env,
        fetchImpl: async () => {
          fetches += 1;
          throw new Error("fetch should not run");
        },
      });
      assert.equal(isOpenMeteoEnabled(env), false);
      assert.equal(fetches, 0);
      assert.equal(result.requests, 0);
      assert.deepEqual(result.days, []);
      assert.equal(result.attribution, null);
    }
  });

  it("makes no request when the flag is on and the key is missing", async () => {
    let fetches = 0;
    const result = await fetchOpenMeteoSnow({
      lat: 40.6443,
      lon: -111.5385,
      env: { ENABLE_OPEN_METEO: "true" },
      fetchImpl: async () => {
        fetches += 1;
        throw new Error("fetch should not run");
      },
    });
    assert.equal(fetches, 0);
    assert.equal(result.requests, 0);
    assert.equal(result.skipped, "OPEN_METEO_API_KEY unset");
  });

  it("calls the customer host and attaches CC BY 4.0 when the flag is on", async () => {
    let url = "";
    const result = await fetchOpenMeteoSnow({
      lat: 40.6443,
      lon: -111.5385,
      timeZone: "America/Denver",
      env: { ENABLE_OPEN_METEO: "true", OPEN_METEO_API_KEY: "test-key" },
      now: () => new Date("2026-11-28T13:30:00.000Z"),
      fetchImpl: async (requestUrl) => {
        url = requestUrl;
        return httpResult(200, {
          daily_units: { snowfall_sum_ncep_gfs_global: "cm" },
          daily: {
            time: ["2026-11-28"],
            snowfall_sum_ncep_gfs_global: [2.54],
            snowfall_sum_ncep_hrrr_conus: [0],
            snowfall_sum_ecmwf_ifs: [5.08],
            snowfall_sum_icon_global: [1.27],
            snowfall_sum_cmc_gem_gdps: [0],
            snowfall_sum_ncep_nbm_conus: [2.54],
          },
        });
      },
    });
    assert.equal(result.requests, 1);
    assert.equal(new URL(url).host, "customer-api.open-meteo.com");
    assert.equal(url.startsWith("https://api.open-meteo.com/"), false);
    const params = new URL(url).searchParams;
    assert.equal(params.get("apikey"), "test-key");
    assert.equal(params.get("forecast_days"), "7");
    assert.equal(params.get("timezone"), "America/Denver");
    for (const model of [
      "ncep_gfs_global",
      "ncep_hrrr_conus",
      "ecmwf_ifs",
      "icon_global",
      "cmc_gem_gdps",
      "ncep_nbm_conus",
    ]) {
      assert.ok(params.get("models").includes(model), model);
    }
    assert.equal(result.attribution.license, "CC BY 4.0");
    assert.equal(result.attribution.provider, "Open-Meteo");
    const bySource = Object.fromEntries(result.days.map((day) => [day.source, day.inches]));
    assert.equal(bySource["open-meteo:gfs"], 1);
    assert.equal(bySource["open-meteo:hrrr"], 0);
    assert.equal(bySource["open-meteo:ecmwf"], 2);
    assert.equal(bySource["open-meteo:icon"], 0.5);
    assert.equal(bySource["open-meteo:gem"], 0);
    assert.equal(bySource["open-meteo:nbm"], 1);
    const forecast = applyBlendToForecast(
      [{ validTime: "2026-11-28", snow: { value: 1 } }],
      {
        uom: "us",
        vcIssuedAt: "2026-11-28T13:30:00.000Z",
        extrasByDate: new Map([["2026-11-28", result.days]]),
      }
    );
    assert.deepEqual(attributionForForecast(forecast), [result.attribution]);
    assert.equal(attributionForForecast([{ blend: { sources: ["visualCrossing"] } }]).length, 0);
  });

  it("does not fan one unsuffixed snowfall series out to every model", () => {
    const days = parseOpenMeteoDaily(
      { daily: { time: ["2026-11-28"], snowfall_sum: [2.54] } },
      "2026-11-28T00:00:00.000Z"
    );
    assert.deepEqual(days, []);
  });
});

describe("snow blend fail-soft", () => {
  it("keeps going when NWS throws or a resort save throws", async () => {
    const saved = [];
    const nwsCalls = [];
    const weather = {
      lastChecked: "2026-11-28T13:30:00.000Z",
      weatherData: {
        visualCrossing: {
          uom: "us",
          forecast: [
            { validTime: "2026-11-28", snow: { value: 0.8, snowDepth: 4 } },
            { validTime: "2026-12-06", snow: { value: 3, snowDepth: 4 } },
          ],
        },
      },
    };
    const counts = await runSnowBlendIngest(
      [
        {
          resortId: "nws-down",
          resortName: "Nws Down",
          Country: "United States",
          Latitude: 40.6,
          Longitude: -111.5,
        },
        {
          resortId: "ok",
          resortName: "Ok",
          Country: "United States",
          Latitude: 39.6,
          Longitude: -106.3,
          forecastPoint: { lat: 39.6247, lon: -106.3889 },
        },
        {
          resortId: "save-down",
          resortName: "Save Down",
          Country: "United States",
          Latitude: 37.9,
          Longitude: -107.8,
        },
        {
          resortId: "canada",
          resortName: "Whistler",
          Country: "Canada",
          Latitude: 50.1163,
          Longitude: -122.9574,
        },
      ],
      {
        concurrency: 2,
        isOpenMeteoEnabled: () => false,
        fetchOpenMeteo: async () => {
          throw new Error("Open-Meteo must not be called");
        },
        loadWeather: async () => weather,
        fetchNwsSnow: async ({ resortId, lat, lon }) => {
          nwsCalls.push({ resortId, lat, lon });
          if (resortId === "nws-down") throw new Error("NWS HTTP 503");
          return {
            timeZone: "America/Denver",
            issuedAt: "2026-11-28T06:31:26+00:00",
            days: [{ date: "2026-11-28", inches: 4 }],
          };
        },
        saveBlend: async (doc) => {
          if (doc.resortId === "save-down") throw new Error("mongo down");
          saved.push(doc);
        },
        log: { error() {} },
      }
    );

    assert.equal(counts.ok, 3);
    assert.equal(counts.failed, 1);
    assert.equal(counts.nwsFailed, 1);
    assert.equal(counts.openMeteoRequests, 0);
    assert.equal(counts.openMeteoEnabled, false);
    assert.deepEqual(
      nwsCalls.map((call) => call.resortId).sort(),
      ["nws-down", "ok", "save-down"]
    );
    const okCall = nwsCalls.find((call) => call.resortId === "ok");
    assert.equal(okCall.lat, 39.6247);
    assert.equal(okCall.lon, -106.3889);

    const down = saved.find((doc) => doc.resortId === "nws-down");
    assert.equal(down.forecast[0].snow.value, 0.8);
    assert.equal(down.forecast[0].blend.singleSource, true);
    assert.equal(down.forecast[0].blend.median, 0.8);
    assert.equal(down.forecast[0].blend.low, 0.8);
    assert.equal(down.forecast[0].blend.high, 0.8);
    assert.equal(down.forecast[1].blend.singleSource, true);

    const ok = saved.find((doc) => doc.resortId === "ok");
    assert.equal(ok.forecast[0].blend.n, 2);
    assert.equal(ok.forecast[0].blend.singleSource, false);
    assert.equal(ok.forecast[0].blend.low, 0.8);
    assert.equal(ok.forecast[0].blend.high, 4);
    assert.equal(ok.forecast[0].blend.median, 2.4);
    assert.equal(ok.forecast[1].blend.singleSource, true);
    assert.equal(ok.forecast[1].blend.median, 3);

    const canada = saved.find((doc) => doc.resortId === "canada");
    assert.equal(canada.forecast[0].blend.singleSource, true);
    assert.deepEqual(canada.forecast[0].blend.sources, ["visualCrossing"]);
    assert.equal(saved.some((doc) => doc.resortId === "save-down"), false);
  });
});

describe("NWS client", () => {
  it("sends a contact User-Agent and retries 503 with backoff", async () => {
    assert.equal(nwsUserAgent({}), "PowAlert snow-blend (forecast@powalert.com)");
    assert.equal(
      nwsUserAgent({ NWS_CONTACT_EMAIL: " ops@example.com " }),
      "PowAlert snow-blend (ops@example.com)"
    );

    const sleeps = [];
    let attempts = 0;
    let userAgent = "";
    const counts = { nwsRequests: 0, nwsPointsRequests: 0, nwsGridRequests: 0 };
    await assert.rejects(
      () =>
        fetchJsonWithRetry("https://api.weather.gov/points/1,2", {
          attempts: 3,
          sleepImpl: async (ms) => {
            sleeps.push(ms);
          },
          headers: {},
          label: "NWS",
          fetchImpl: async () => {
            attempts += 1;
            return httpResult(503, "unavailable");
          },
        }),
      /NWS HTTP 503/
    );
    assert.equal(attempts, 3);
    assert.deepEqual(sleeps, [500, 1000]);

    attempts = 0;
    const cache = new Map();
    const result = await fetchNwsSnow({
      resortId: "park",
      lat: 40.6442644,
      lon: -111.5385011,
      counts,
      attempts: 3,
      sleepImpl: async (ms) => {
        sleeps.push(ms);
      },
      env: {},
      cache: {
        async get(id) {
          return cache.get(id) || null;
        },
        async set(record) {
          cache.set(record.resortId, record);
        },
      },
      fetchImpl: async (url, options) => {
        attempts += 1;
        userAgent = options.headers["User-Agent"];
        if (String(url).includes("/points/") && attempts === 1) {
          return httpResult(503, "unavailable");
        }
        if (String(url).includes("/points/")) {
          return httpResult(200, {
            properties: {
              gridId: "SLC",
              gridX: 112,
              gridY: 169,
              timeZone: "America/Denver",
            },
          });
        }
        return httpResult(200, {
          properties: {
            updateTime: "2026-11-28T06:31:26+00:00",
            snowfallAmount: {
              uom: "wmoUnit:mm",
              values: [{ validTime: "2026-11-28T15:00:00+00:00/PT1H", value: 25.4 }],
            },
          },
        });
      },
    });
    assert.equal(userAgent, "PowAlert snow-blend (forecast@powalert.com)");
    assert.equal(counts.nwsPointsRequests, 2);
    assert.equal(counts.nwsGridRequests, 1);
    assert.equal(counts.nwsRequests, 3);
    assert.equal(result.days.find((day) => day.date === "2026-11-28").inches, 1);

    const before = counts.nwsRequests;
    await fetchNwsSnow({
      resortId: "park",
      lat: 40.6442644,
      lon: -111.5385011,
      counts,
      cache: {
        async get(id) {
          return cache.get(id) || null;
        },
        async set() {
          throw new Error("cache should not be written on a hit");
        },
      },
      fetchImpl: async (url) => {
        assert.equal(String(url).includes("/points/"), false);
        assert.match(String(url), /\/gridpoints\/SLC\/112,169$/);
        return httpResult(200, {
          properties: {
            updateTime: "2026-11-28T06:31:26+00:00",
            snowfallAmount: { uom: "wmoUnit:mm", values: [] },
          },
        });
      },
    });
    assert.equal(counts.nwsRequests, before + 1);
    assert.equal(counts.nwsPointsRequests, 2);
    assert.equal(counts.nwsGridRequests, 2);
  });

  it("does not call gridpoints after a points 404", async () => {
    const urls = [];
    const counts = { nwsRequests: 0, nwsPointsRequests: 0, nwsGridRequests: 0 };
    await assert.rejects(
      () =>
        fetchNwsSnow({
          resortId: "missing",
          lat: 40,
          lon: -111,
          counts,
          sleepImpl: async () => {
            throw new Error("404 should not retry");
          },
          cache: {
            async get() {
              return null;
            },
            async set() {
              throw new Error("404 should not be cached");
            },
          },
          fetchImpl: async (url) => {
            urls.push(String(url));
            return httpResult(404, "not found");
          },
        }),
      /NWS HTTP 404/
    );
    assert.equal(urls.length, 1);
    assert.match(urls[0], /\/points\/40,-111$/);
    assert.equal(counts.nwsRequests, 1);
    assert.equal(counts.nwsGridRequests, 0);
  });
});

describe("recorded Park City NWS fixture", () => {
  const fixture = JSON.parse(
    readFileSync(join(root, "tests/fixtures/nwsParkCityForecastPoint.json"), "utf8")
  );
  const catalog = JSON.parse(readFileSync(join(root, "data/forecastPoints.json"), "utf8"));
  const parkCity = catalog.resorts.find(
    (resort) => resort.resortName === "Park City Mountain Resort"
  );

  it("is the live /points response for the mid-mountain forecast point", () => {
    assert.equal(fixture.forecastPoint.lat, parkCity.forecastPoint.lat);
    assert.equal(fixture.forecastPoint.lon, parkCity.forecastPoint.lon);
    assert.equal(
      formatNwsCoordinate(parkCity.forecastPoint.lat),
      40.6443
    );
    assert.equal(
      formatNwsCoordinate(parkCity.forecastPoint.lon),
      -111.5385
    );
    assert.equal(
      fixture.pointsUrl,
      `https://api.weather.gov/points/${formatNwsCoordinate(parkCity.forecastPoint.lat)},${formatNwsCoordinate(parkCity.forecastPoint.lon)}`
    );
    assert.equal(fixture.grid.gridId, "SLC");
    assert.equal(fixture.grid.gridX, 112);
    assert.equal(fixture.grid.gridY, 169);
    assert.equal(fixture.grid.timeZone, "America/Denver");
    assert.equal(fixture.snowfallAmount.uom, "wmoUnit:mm");
    assert.ok(fixture.snowfallAmount.values.length > 0);
  });

  it("buckets the recorded snowfallAmount, including a period that crosses midnight", () => {
    const crossing = fixture.snowfallAmount.values.find(
      (entry) => entry.validTime === "2026-11-28T06:00:00+00:00/PT6H"
    );
    const split = bucketQuantitativeValues([crossing], "America/Denver");
    assert.deepEqual(
      split.map((bucket) => bucket.date),
      ["2026-11-27", "2026-11-28"]
    );
    closeTo(split[0].amount, crossing.value / 6);
    closeTo(split[1].amount, (crossing.value * 5) / 6);

    const days = nwsDailyInches(fixture.snowfallAmount, fixture.grid.timeZone);
    const nov28 = days.find((day) => day.date === "2026-11-28");
    assert.ok(nov28);
    assert.equal(roundSnowInches(nov28.inches), 1.58);
    assert.ok(days.every((day) => /^\d{4}-\d{2}-\d{2}$/.test(day.date)));
  });
});

describe("blend wiring leaves Visual Crossing calls and alert thresholds alone", () => {
  it("does not add a Visual Crossing fetch on the blend path", () => {
    const updater = readFileSync(join(root, "utils/updateWeatherData.js"), "utf8");
    assert.equal(updater.split("fetchFn(").length - 1, 1);
    for (const file of [
      "utils/snowBlendIngest.js",
      "utils/runSnowBlendJob.js",
      "utils/snowBlend.js",
      "utils/snowRatio.js",
      "utils/nwsSnow.js",
      "externalAPI/nwsAPI.js",
      "externalAPI/openMeteoAPI.js",
    ]) {
      const source = readFileSync(join(root, file), "utf8");
      assert.doesNotMatch(source, /fetchVisualCrossing|visualcrossing\.com/i);
    }
    const cron = readFileSync(join(root, "cron/visualCrossingCron.js"), "utf8");
    const weatherJob = cron.indexOf('cron.schedule("30 6 * * *"');
    const blendJob = cron.indexOf("runSnowBlendJob(resorts)");
    const alertLock = cron.indexOf('ENABLE_POWDER_ALERT_CRON === "true"');
    assert.ok(weatherJob > 0 && blendJob > weatherJob && alertLock > blendJob);
    assert.match(cron, /ENABLE_POWDER_ALERT_CRON === "true"/);
    assert.doesNotMatch(cron, /ENABLE_POWDER_ALERT_CRON\s*=\s*"true"/);
    assert.doesNotMatch(cron.slice(alertLock), /runSnowBlendJob/);
  });

  it("keeps alert reads on snow.value", () => {
    const service = readFileSync(join(root, "services/weatherAlertService.js"), "utf8");
    const gate = readFileSync(join(root, "utils/stormAlertGate.js"), "utf8");
    assert.match(service, /day\.snow\?\.value/);
    assert.doesNotMatch(service, /blend|open-meteo|openMeteo|nwsAPI/);
    assert.doesNotMatch(gate, /blend|open-meteo|ENABLE_OPEN_METEO/);
    const controller = readFileSync(
      join(root, "controllers/visual-crossing.controller.js"),
      "utf8"
    );
    assert.match(controller, /attributionForForecast/);
    const publicBody = controller.slice(
      controller.indexOf("export const findPublicForecast"),
      controller.indexOf("export const getWeatherAlerts")
    );
    assert.match(publicBody, /attributionForForecast/);
    assert.doesNotMatch(publicBody, /fetchVisualCrossing|fetchNwsSnow|fetchOpenMeteo/);
  });
});
