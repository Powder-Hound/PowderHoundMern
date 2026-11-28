import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fetchNwsSnow } from "../externalAPI/nwsAPI.js";
import { runSnowBlendIngest } from "../utils/snowBlendIngest.js";
import {
  buildNwsWindows,
  localHourStarts,
  slrInchesByDay,
  zonedCivilToUtcMs,
} from "../utils/nwsSnow.js";
import {
  KUCHERA_BREAK_K,
  RAIN_SNOW_CUTOFF_F,
  kucheraSlr,
  snowFromLiquid,
} from "../utils/snowRatio.js";
import {
  applyBlendToForecast,
  blendIncludesPowalertSlr,
  buildBlend,
} from "../utils/snowBlend.js";

function closeTo(actual, expected, eps = 1e-6) {
  assert.ok(
    Math.abs(actual - expected) < eps,
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

function inches(value) {
  return { uom: "inch", values: value };
}

describe("SLR curve", () => {
  it("follows the published Kuchera coefficients and a 32°F cutoff", () => {
    const breakF = ((KUCHERA_BREAK_K - 273.15) * 9) / 5 + 32;
    closeTo(kucheraSlr(breakF), 12);
    closeTo(kucheraSlr(32), 8.02, 1e-6);
    closeTo(kucheraSlr(14), 20.01, 1e-4);
    assert.equal(RAIN_SNOW_CUTOFF_F, 32);

    closeTo(snowFromLiquid(1, 32), kucheraSlr(32));
    closeTo(snowFromLiquid(0.5, 14), 0.5 * kucheraSlr(14));
    assert.equal(snowFromLiquid(1, 32.1), 0);
    assert.equal(snowFromLiquid(3, 40), 0);
    assert.equal(snowFromLiquid(0, 40), 0);
    assert.equal(snowFromLiquid(1, 36, 30) > 0, true);
    closeTo(snowFromLiquid(1, 36, 30), kucheraSlr(30));
    assert.equal(snowFromLiquid(1, 20, 33), 0);
    assert.equal(snowFromLiquid(-1, 20), null);
    assert.equal(snowFromLiquid(1, Number.NaN), null);
    assert.equal(snowFromLiquid(1, 20, "warm"), null);
    assert.equal(snowFromLiquid(0, 10), 0);
  });

  it("is monotonic from cold to the freezing cutoff", () => {
    let previous = kucheraSlr(-40);
    for (let temp = -39; temp <= 32; temp += 1) {
      const ratio = kucheraSlr(temp);
      assert.ok(ratio <= previous + 1e-9, `${temp}°F ratio ${ratio} rose above ${previous}`);
      previous = ratio;
      assert.ok(snowFromLiquid(1, temp) > 0);
    }
    assert.equal(snowFromLiquid(2, 10), snowFromLiquid(1, 10) * 2);
  });
});

describe("12-hour windows across time zones and DST", () => {
  it("puts 5 PM–5 AM on the morning it ends, and keeps 5 AM–5 PM on that day", () => {
    const now = new Date("2026-01-15T16:00:00Z");
    const overnight = inches([
      { validTime: "2026-01-15T00:00:00Z/PT12H", value: 12 },
    ]);
    const denver = buildNwsWindows({
      snowfallAmount: overnight,
      timeZone: "America/Denver",
      now,
    });
    assert.deepEqual(
      denver.map((day) => day.date),
      ["2026-01-15", "2026-01-16", "2026-01-17", "2026-01-18"]
    );
    assert.equal(denver[0].overnight.snowIn, 12);
    assert.equal(denver[0].overnight.coverage, 1);
    assert.equal(denver[0].daytime.snowIn, null);
    assert.equal(denver[0].hourly.length, 24);
    assert.equal(denver[1].overnight.snowIn, null);

    const eastern = buildNwsWindows({
      snowfallAmount: overnight,
      timeZone: "America/New_York",
      now,
    });
    assert.equal(eastern[0].overnight.snowIn, 10);
    assert.equal(eastern[0].daytime.snowIn, 2);
    assert.equal(eastern[0].hourly.length, 24);

    const eveningBefore = buildNwsWindows({
      snowfallAmount: inches([
        { validTime: "2026-01-15T01:00:00Z/PT1H", value: 3 },
      ]),
      timeZone: "America/Denver",
      now,
    });
    assert.equal(eveningBefore[0].overnight.snowIn, 3);
    assert.equal(eveningBefore[0].daytime.snowIn, null);
  });

  it("splits a block that crosses 5 AM by the hours on each side", () => {
    const windows = buildNwsWindows({
      snowfallAmount: inches([
        { validTime: "2026-01-15T10:00:00Z/PT6H", value: 6 },
      ]),
      quantitativePrecipitation: inches([
        { validTime: "2026-01-15T10:00:00Z/PT6H", value: 1.2 },
      ]),
      temperature: {
        uom: "wmoUnit:degC",
        values: [{ validTime: "2026-01-15T10:00:00Z/PT6H", value: -10 }],
      },
      timeZone: "America/Denver",
      now: new Date("2026-01-15T16:00:00Z"),
    });
    assert.equal(windows[0].overnight.snowIn, 2);
    assert.equal(windows[0].daytime.snowIn, 4);
    assert.equal(windows[0].overnight.qpfIn, 0.4);
    assert.equal(windows[0].daytime.qpfIn, 0.8);
    assert.equal(windows[0].overnight.tempF, 14);
    const hour3 = windows[0].hourly.find((hour) => hour.hourLocal === 3);
    const hour5 = windows[0].hourly.find((hour) => hour.hourLocal === 5);
    assert.equal(hour3.snowIn, 1);
    assert.equal(hour5.snowIn, 1);
    assert.equal(hour5.tempF, 14);
  });

  it("uses 23 hours on a spring-forward day and 25 on a fall-back day", () => {
    const springStart = zonedCivilToUtcMs(2026, 3, 7, 17, 0, 0, "America/Denver");
    const springEnd = zonedCivilToUtcMs(2026, 3, 8, 5, 0, 0, "America/Denver");
    assert.equal(springEnd - springStart, 11 * 3600000);
    assert.equal(localHourStarts("2026-03-08", "America/Denver").length, 23);

    const spring = buildNwsWindows({
      snowfallAmount: inches([
        {
          validTime: `${new Date(springStart).toISOString()}/PT11H`,
          value: 11,
        },
      ]),
      timeZone: "America/Denver",
      now: new Date("2026-03-08T18:00:00Z"),
    });
    assert.equal(spring[0].date, "2026-03-08");
    assert.equal(spring[0].overnight.snowIn, 11);
    assert.equal(spring[0].overnight.coverage, 1);
    assert.equal(spring[0].daytime.snowIn, null);
    assert.equal(spring[0].hourly.length, 23);
    assert.equal(
      spring[0].hourly.some((hour) => hour.hourLocal === 2),
      false
    );

    const fallStart = zonedCivilToUtcMs(2026, 10, 31, 17, 0, 0, "America/Denver");
    const fallEnd = zonedCivilToUtcMs(2026, 11, 1, 5, 0, 0, "America/Denver");
    assert.equal(fallEnd - fallStart, 13 * 3600000);
    assert.equal(localHourStarts("2026-11-01", "America/Denver").length, 25);

    const fall = buildNwsWindows({
      snowfallAmount: inches([
        {
          validTime: `${new Date(fallStart).toISOString()}/PT13H`,
          value: 13,
        },
      ]),
      timeZone: "America/Denver",
      now: new Date("2026-11-01T18:00:00Z"),
    });
    assert.equal(fall[0].overnight.snowIn, 13);
    assert.equal(fall[0].overnight.coverage, 1);
    assert.equal(fall[0].hourly.length, 25);
    assert.equal(fall[0].hourly.filter((hour) => hour.hourLocal === 1).length, 2);
    const repeated = fall[0].hourly.filter((hour) => hour.hourLocal === 1);
    assert.notEqual(repeated[0].start, repeated[1].start);
  });
});

describe("powalert-slr stays out of the blend unless the flag is exactly true", () => {
  const observations = [
    { source: "visualCrossing", inches: 1, issuedAt: "t" },
    { source: "nws", inches: 4, issuedAt: "t" },
    { source: "powalert-slr", inches: 9, issuedAt: "t" },
  ];

  it("leaves median, low, high, and n unchanged when the flag is off", () => {
    assert.equal(blendIncludesPowalertSlr({}), false);
    assert.equal(blendIncludesPowalertSlr({ BLEND_INCLUDE_POWALERT_SLR: "false" }), false);
    assert.equal(blendIncludesPowalertSlr({ BLEND_INCLUDE_POWALERT_SLR: "1" }), false);
    assert.equal(blendIncludesPowalertSlr({ BLEND_INCLUDE_POWALERT_SLR: "TRUE" }), false);
    assert.equal(blendIncludesPowalertSlr({ BLEND_INCLUDE_POWALERT_SLR: "true" }), true);

    const base = buildBlend(observations.slice(0, 2));
    const held = buildBlend(observations, { includePowalertSlr: false });
    assert.deepEqual(held.blend, base.blend);
    assert.equal(held.blend.n, 2);
    assert.equal(held.blend.median, 2.5);
    assert.equal(held.blend.high, 4);
    assert.deepEqual(held.blend.sources, ["visualCrossing", "nws"]);
    assert.deepEqual(
      held.snowSources.map((source) => source.source),
      ["visualCrossing", "nws", "powalert-slr"]
    );

    const included = buildBlend(observations, { includePowalertSlr: true });
    assert.equal(included.blend.n, 3);
    assert.equal(included.blend.median, 4);
    assert.equal(included.blend.high, 9);
    assert.deepEqual(included.blend.sources, ["visualCrossing", "nws", "powalert-slr"]);
  });

  it("sums QPF through the curve, including a rain hour as zero snow", () => {
    const days = slrInchesByDay({
      quantitativePrecipitation: {
        uom: "wmoUnit:mm",
        values: [
          { validTime: "2026-01-15T15:00:00Z/PT1H", value: 25.4 },
          { validTime: "2026-01-15T16:00:00Z/PT1H", value: 25.4 },
        ],
      },
      temperature: {
        uom: "wmoUnit:degC",
        values: [
          { validTime: "2026-01-15T15:00:00Z/PT1H", value: -10 },
          { validTime: "2026-01-15T16:00:00Z/PT1H", value: 2 },
        ],
      },
      timeZone: "America/Denver",
    });
    const jan15 = days.find((day) => day.date === "2026-01-15");
    closeTo(jan15.inches, Math.round(kucheraSlr(14) * 100) / 100, 1e-9);
  });
});

describe("windows and powalert-slr on the stored forecast", () => {
  it("reads QPF and temperature from the one gridpoint fetch", async () => {
    const urls = [];
    const counts = { nwsRequests: 0, nwsPointsRequests: 0, nwsGridRequests: 0 };
    const result = await fetchNwsSnow({
      resortId: "park",
      lat: 40.6443,
      lon: -111.5385,
      counts,
      now: new Date("2026-01-15T16:00:00Z"),
      cache: {
        async get() {
          return {
            resortId: "park",
            lat: 40.6443,
            lon: -111.5385,
            wfo: "SLC",
            gridX: 112,
            gridY: 169,
            timeZone: "America/Denver",
          };
        },
        async set() {
          throw new Error("cache hit should not write");
        },
      },
      fetchImpl: async (url) => {
        urls.push(String(url));
        return httpResult(200, {
          properties: {
            updateTime: "2026-01-15T12:00:00+00:00",
            snowfallAmount: inches([
              { validTime: "2026-01-15T00:00:00Z/PT12H", value: 4 },
            ]),
            quantitativePrecipitation: {
              uom: "wmoUnit:mm",
              values: [{ validTime: "2026-01-15T15:00:00Z/PT1H", value: 25.4 }],
            },
            temperature: {
              uom: "wmoUnit:degC",
              values: [{ validTime: "2026-01-15T15:00:00Z/PT1H", value: -10 }],
            },
          },
        });
      },
    });
    assert.equal(urls.length, 1);
    assert.match(urls[0], /\/gridpoints\/SLC\/112,169$/);
    assert.equal(counts.nwsRequests, 1);
    assert.equal(counts.nwsGridRequests, 1);
    assert.equal(counts.nwsPointsRequests, 0);
    assert.equal(result.windows[0].overnight.snowIn, 4);
    assert.equal(result.slrDays.find((day) => day.date === "2026-01-15").inches, 20.01);
  });

  it("attaches windows for a US resort and omits them for Canada", async () => {
    const weather = {
      lastChecked: "2026-01-15T13:30:00.000Z",
      weatherData: {
        visualCrossing: {
          uom: "us",
          forecast: [
            { validTime: "2026-01-15", snow: { value: 1 }, nwsWindows: { stale: true } },
            { validTime: "2026-01-20", snow: { value: 2 }, nwsWindows: { stale: true } },
          ],
        },
      },
    };
    const saved = [];
    await runSnowBlendIngest(
      [
        {
          resortId: "us",
          resortName: "Park City",
          Country: "United States",
          Latitude: 40.6,
          Longitude: -111.5,
        },
        {
          resortId: "ca",
          resortName: "Whistler",
          Country: "Canada",
          Latitude: 50.1,
          Longitude: -122.9,
        },
      ],
      {
        concurrency: 1,
        isOpenMeteoEnabled: () => false,
        includePowalertSlr: () => false,
        fetchOpenMeteo: async () => {
          throw new Error("Open-Meteo must not be called");
        },
        loadWeather: async () => weather,
        fetchNwsSnow: async () => ({
          timeZone: "America/Denver",
          issuedAt: "2026-01-15T12:00:00Z",
          days: [{ date: "2026-01-15", inches: 4 }],
          slrDays: [{ date: "2026-01-15", inches: 9 }],
          windows: [
            {
              date: "2026-01-15",
              overnight: { snowIn: 3, qpfIn: 0.4, tempF: 28, coverage: 1 },
              daytime: { snowIn: 1, qpfIn: 0.1, tempF: 34, coverage: 1 },
              hourly: [{ start: "2026-01-15T07:00:00.000Z", hourLocal: 0, snowIn: 0.2, qpfIn: 0.02, tempF: 27 }],
            },
          ],
        }),
        saveBlend: async (doc) => {
          saved.push(doc);
        },
        log: { error() {} },
      }
    );

    const us = saved.find((doc) => doc.resortId === "us");
    assert.equal(us.forecast[0].snow.value, 1);
    assert.equal(us.forecast[0].nwsWindows.overnight.snowIn, 3);
    assert.equal(us.forecast[0].nwsWindows.daytime.snowIn, 1);
    assert.equal(us.forecast[0].nwsWindows.hourly.length, 1);
    assert.equal(us.forecast[1].nwsWindows, undefined);
    assert.equal(us.forecast[0].blend.n, 2);
    assert.equal(us.forecast[0].blend.median, 2.5);
    assert.equal(us.forecast[0].blend.high, 4);
    assert.deepEqual(us.forecast[0].blend.sources, ["visualCrossing", "nws"]);
    assert.equal(
      us.forecast[0].snowSources.some((source) => source.source === "powalert-slr" && source.inches === 9),
      true
    );

    const canada = saved.find((doc) => doc.resortId === "ca");
    assert.equal(canada.forecast[0].nwsWindows, undefined);
    assert.equal(canada.forecast[1].nwsWindows, undefined);
    assert.deepEqual(canada.forecast[0].blend.sources, ["visualCrossing"]);
    assert.equal(
      canada.forecast[0].snowSources.some((source) => source.source === "powalert-slr"),
      false
    );

    const opened = applyBlendToForecast(weather.weatherData.visualCrossing.forecast, {
      uom: "us",
      vcIssuedAt: "t",
      extrasByDate: new Map([
        ["2026-01-15", [{ source: "powalert-slr", inches: 9, issuedAt: "t" }]],
      ]),
      windowsByDate: new Map(),
      includePowalertSlr: true,
    });
    assert.equal(opened[0].blend.n, 2);
    assert.equal(opened[0].blend.high, 9);
    assert.equal(opened[0].nwsWindows, undefined);
  });
});
