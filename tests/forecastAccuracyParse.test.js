import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { resortByName } from "../config/forecastAccuracyStations.js";
import { FORECAST_ACCURACY_SCHEDULES } from "../cron/forecastAccuracyCron.js";
import {
  buildCpcRows,
  mapCpcCategory,
} from "../services/forecastAccuracy/cpcOutlook.js";
import {
  parseNwsBundle,
  sumSnowByLocalDate,
} from "../services/forecastAccuracy/nwsForecast.js";
import {
  bestKnownInit,
  parseOpenMeteoDaily,
} from "../services/forecastAccuracy/openMeteo.js";
import {
  awdbRequestEnd,
  buildDailyObservation,
  chooseStation,
  newSnowFromSnwd,
  parseAwdbPayload,
  positiveCumulativeDelta,
  qualityFor,
} from "../services/forecastAccuracy/snotel.js";
import {
  calendarDateInZone,
  captureSlot,
  zonedMidnightUtc,
} from "../services/forecastAccuracy/time.js";
import { parseVisualCrossingDays } from "../services/forecastAccuracy/visualCrossingForecast.js";
import { isForecastAccuracyCronEnabled } from "../utils/forecastAccuracyGate.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function snwdMap(date, values) {
  const map = new Map();
  values.forEach((value, hour) => {
    if (value == null) return;
    map.set(`${date} ${String(hour).padStart(2, "0")}:00`, value);
  });
  return map;
}

describe("forecast accuracy cron stays off and off the alert path", () => {
  it("enables only the exact string true", () => {
    assert.equal(isForecastAccuracyCronEnabled({}), false);
    assert.equal(isForecastAccuracyCronEnabled({ ENABLE_FORECAST_ACCURACY_CRON: "false" }), false);
    assert.equal(isForecastAccuracyCronEnabled({ ENABLE_FORECAST_ACCURACY_CRON: "TRUE" }), false);
    assert.equal(isForecastAccuracyCronEnabled({ ENABLE_FORECAST_ACCURACY_CRON: "1" }), false);
    assert.equal(isForecastAccuracyCronEnabled({ ENABLE_FORECAST_ACCURACY_CRON: "true" }), true);
  });

  it("schedules 12:30Z, 00:30Z, and 13:15Z in UTC", () => {
    assert.deepEqual(
      FORECAST_ACCURACY_SCHEDULES.map((job) => `${job.cron} ${job.timezone}`),
      ["30 12 * * * UTC", "30 0 * * * UTC", "15 13 * * * UTC"]
    );
  });

  it("does not import the powder alert cron, gate, or service", () => {
    const cronSrc = readFileSync(join(root, "cron/forecastAccuracyCron.js"), "utf8");
    const indexSrc = readFileSync(join(root, "index.js"), "utf8");
    const alertCron = readFileSync(join(root, "cron/visualCrossingCron.js"), "utf8");
    assert.match(indexSrc, /startForecastAccuracyCron/);
    assert.match(indexSrc, /startVisualCrossingCron/);
    assert.match(alertCron, /ENABLE_POWDER_ALERT_CRON/);
    assert.doesNotMatch(cronSrc, /weatherAlertService|stormAlertGate|ENABLE_POWDER_ALERT_CRON|fetchVisualCrossingAlerts/);
    assert.doesNotMatch(
      readFileSync(join(root, "services/forecastAccuracy/capture.js"), "utf8"),
      /weatherAlertService|stormAlertGate|visualCrossingAPI/
    );
  });
});

describe("local calendar time", () => {
  it("places Denver and New York midnights on the right UTC instant", () => {
    assert.equal(
      zonedMidnightUtc("2026-10-17", "America/Denver").toISOString(),
      "2026-10-17T06:00:00.000Z"
    );
    assert.equal(
      zonedMidnightUtc("2026-10-17", "America/New_York").toISOString(),
      "2026-10-17T04:00:00.000Z"
    );
    assert.equal(
      zonedMidnightUtc("2026-12-01", "America/Denver").toISOString(),
      "2026-12-01T07:00:00.000Z"
    );
    assert.equal(
      zonedMidnightUtc("2026-11-01", "America/Denver").toISOString(),
      "2026-11-01T06:00:00.000Z"
    );
  });

  it("labels 00Z as the previous evening in Denver", () => {
    assert.equal(
      calendarDateInZone(new Date("2026-10-17T00:00:00Z"), "America/Denver"),
      "2026-10-16"
    );
  });

  it("picks the 12:30Z or 00:30Z capture slot", () => {
    assert.equal(captureSlot(new Date("2026-10-17T12:30:00Z")).toISOString(), "2026-10-17T12:30:00.000Z");
    assert.equal(captureSlot(new Date("2026-10-17T12:29:00Z")).toISOString(), "2026-10-17T00:30:00.000Z");
    assert.equal(captureSlot(new Date("2026-10-18T00:30:00Z")).toISOString(), "2026-10-18T00:30:00.000Z");
  });
});

describe("Open-Meteo init schedule and daily parse", () => {
  const morning = new Date("2026-10-17T12:30:00Z");
  const evening = new Date("2026-10-18T00:30:00Z");

  it("uses the latest cycle whose delay has elapsed", () => {
    assert.equal(bestKnownInit(morning, "ecmwf_ifs025").toISOString(), "2026-10-17T00:00:00.000Z");
    assert.equal(bestKnownInit(morning, "gfs_seamless").toISOString(), "2026-10-17T06:00:00.000Z");
    assert.equal(bestKnownInit(morning, "ncep_hrrr_conus").toISOString(), "2026-10-17T10:00:00.000Z");
    assert.equal(bestKnownInit(evening, "ecmwf_ifs025").toISOString(), "2026-10-17T12:00:00.000Z");
    assert.equal(bestKnownInit(evening, "gfs_seamless").toISOString(), "2026-10-17T18:00:00.000Z");
  });

  it("keeps short-range days that exist and drops null tails", () => {
    const rows = parseOpenMeteoDaily(
      {
        daily: {
          time: ["2026-10-17", "2026-10-18", "2026-10-19"],
          snowfall_sum_gfs_seamless: [0, 1.5, 2],
          temperature_2m_max_gfs_seamless: [40, 38, 35],
          temperature_2m_min_gfs_seamless: [20, 18, 16],
          snowfall_sum_ncep_hrrr_conus: [0.2, null, null],
          temperature_2m_max_ncep_hrrr_conus: [41, null, null],
          temperature_2m_min_ncep_hrrr_conus: [22, null, null],
        },
      },
      {
        resort: "Alta",
        timezone: "America/Denver",
        capturedAt: morning,
        runTimes: {
          gfs_seamless: new Date("2026-10-17T06:00:00Z"),
          ncep_hrrr_conus: new Date("2026-10-17T10:00:00Z"),
        },
      }
    );
    const gfs = rows.filter((row) => row.model === "gfs_seamless");
    const hrrr = rows.filter((row) => row.model === "ncep_hrrr_conus");
    assert.equal(gfs.length, 3);
    assert.equal(hrrr.length, 1);
    assert.equal(hrrr[0].snowfallIn, 0.2);
    assert.equal(hrrr[0].validDate, "2026-10-17");
    assert.equal(hrrr[0].leadDays, 0);
    assert.equal(gfs[1].leadDays, 1);
    assert.equal(gfs[1].snowfallIn, 1.5);
    assert.equal(rows.every((row) => row.source === "open-meteo"), true);
  });
});

describe("NWS point and grid parse", () => {
  it("prorates a UTC snowfall block across an Eastern local midnight", () => {
    const totals = sumSnowByLocalDate(
      [{ validTime: "2026-10-17T00:00:00+00:00/PT6H", value: 25.4 }],
      "America/New_York",
      "wmoUnit:mm"
    );
    assert.equal(Math.round(totals.get("2026-10-16") * 1000) / 1000, Math.round((4 / 6) * 1000) / 1000);
    assert.equal(Math.round(totals.get("2026-10-17") * 1000) / 1000, Math.round((2 / 6) * 1000) / 1000);
  });

  it("converts grid snow to inches and hourly temps to F", () => {
    const rows = parseNwsBundle({
      resort: "Park City",
      timeZone: "America/Denver",
      capturedAt: new Date("2026-10-17T12:40:00Z"),
      grid: {
        properties: {
          updateTime: "2026-10-17T12:00:00+00:00",
          snowfallAmount: {
            uom: "wmoUnit:mm",
            values: [
              { validTime: "2026-10-17T06:00:00+00:00/PT6H", value: 12.7 },
              { validTime: "2026-10-18T06:00:00+00:00/PT6H", value: 25.4 },
            ],
          },
          temperature: {
            uom: "wmoUnit:degC",
            values: [
              { validTime: "2026-10-17T12:00:00+00:00/PT1H", value: 0 },
              { validTime: "2026-10-17T18:00:00+00:00/PT1H", value: 10 },
            ],
          },
        },
      },
      forecast: { properties: { periods: [] } },
    });
    const today = rows.find((row) => row.validDate === "2026-10-17");
    const tomorrow = rows.find((row) => row.validDate === "2026-10-18");
    assert.equal(today.snowfallIn, 0.5);
    assert.equal(today.tempLowF, 32);
    assert.equal(today.tempHighF, 50);
    assert.equal(today.leadDays, 0);
    assert.equal(today.model, "nws_point");
    assert.equal(today.initTimeSource, "provider");
    assert.equal(tomorrow.snowfallIn, 1);
    assert.equal(tomorrow.leadDays, 1);
  });
});

describe("CPC 8-14 category", () => {
  it("maps Above, Below, and Normal", () => {
    assert.equal(mapCpcCategory("Above"), "above");
    assert.equal(mapCpcCategory("Below"), "below");
    assert.equal(mapCpcCategory("Normal"), "near");
  });

  it("emits one category row per inclusive valid day and no inches", () => {
    const rows = buildCpcRows({
      resort: "Park City",
      timezone: "America/Denver",
      capturedAt: new Date("2026-10-16T20:00:00Z"),
      tempFeatures: [
        {
          attributes: {
            cat: "Below",
            prob: 33,
            fcst_date: Date.parse("2026-10-16T00:00:00Z"),
            start_date: Date.parse("2026-10-24T00:00:00Z"),
            end_date: Date.parse("2026-10-30T00:00:00Z"),
            idp_filedate: Date.parse("2026-10-16T19:15:39Z"),
          },
        },
      ],
      precipFeatures: [
        {
          attributes: {
            cat: "Above",
            prob: 40,
            fcst_date: Date.parse("2026-10-16T00:00:00Z"),
            start_date: Date.parse("2026-10-24T00:00:00Z"),
            end_date: Date.parse("2026-10-30T00:00:00Z"),
          },
        },
      ],
    });
    assert.equal(rows.length, 7);
    assert.equal(rows[0].validDate, "2026-10-24");
    assert.equal(rows[0].leadDays, 8);
    assert.equal(rows.at(-1).validDate, "2026-10-30");
    assert.equal(rows.at(-1).leadDays, 14);
    assert.equal(rows[0].snowfallIn, null);
    assert.equal(rows[0].category.temp, "below");
    assert.equal(rows[0].category.precip, "above");
    assert.equal(rows[0].category.precipProb, 40);
    assert.equal(rows[0].model, "cpc_8_14");
  });
});

describe("Visual Crossing day parse", () => {
  it("reads US-unit snow and temperature", () => {
    const rows = parseVisualCrossingDays(
      {
        days: [
          { datetime: "2026-10-17", snow: 0, tempmax: 61.2, tempmin: 34.5 },
          { datetime: "2026-10-18", snow: 3.25, tempmax: 30, tempmin: 18 },
        ],
      },
      {
        resort: "Vail",
        timezone: "America/Denver",
        runTime: new Date("2026-10-17T12:30:00Z"),
        capturedAt: new Date("2026-10-17T12:40:00Z"),
      }
    );
    assert.equal(rows.length, 2);
    assert.equal(rows[0].source, "visual-crossing");
    assert.equal(rows[0].leadDays, 0);
    assert.equal(rows[1].snowfallIn, 3.25);
    assert.equal(rows[1].leadDays, 1);
    assert.equal(rows[1].initTimeSource, "capture");
  });
});

describe("SNOTEL daily rollup", () => {
  it("counts positive SNWD change and ignores sub-tolerance jitter", () => {
    assert.equal(newSnowFromSnwd([10, 10.2, 10.5, 11.2], 0.3), 1.2);
    assert.equal(newSnowFromSnwd([10, 12, 11.8, 11.9], 0.3), 2);
    assert.equal(newSnowFromSnwd([10, 14, 12, 13.5], 0.3), 4);
    assert.equal(newSnowFromSnwd([2, 1, 2, 1, 2], 0.3), 0);
    assert.equal(newSnowFromSnwd([0, 1, 1, 0, 1], 0.3), 1);
    assert.equal(newSnowFromSnwd([10, 10.1, 9.9, 10.2], 0.3), 0);
    assert.equal(newSnowFromSnwd([2, 2, 3, 3, 2], 0.3), 1);
    assert.equal(newSnowFromSnwd([], 0.3), null);
    assert.equal(newSnowFromSnwd([4], 0.3), 0);
  });

  it("treats PREC and WTEQ as cumulative diagnostics", () => {
    assert.equal(positiveCumulativeDelta([4.1, 4.1, 4.0, 4.3]), 0.3);
  });

  it("asks AWDB for the day after the requested end", () => {
    assert.equal(awdbRequestEnd("2026-10-15"), "2026-10-16");
  });

  it("parses an AWDB payload into element maps", () => {
    const parsed = parseAwdbPayload([
      {
        stationTriplet: "814:UT:SNTL",
        data: [
          {
            stationElement: { elementCode: "SNWD" },
            values: [
              { date: "2026-10-15 00:00", value: 0 },
              { date: "2026-10-15 01:00", value: null },
              { date: "2026-10-15 02:00", value: 1 },
            ],
          },
        ],
      },
    ]);
    assert.equal(parsed.get("814:UT:SNTL").SNWD.get("2026-10-15 02:00"), 1);
    assert.equal(parsed.get("814:UT:SNTL").SNWD.has("2026-10-15 01:00"), false);
  });

  it("falls back to Mount Baker's backup when primary SNWD is sparse", () => {
    const baker = resortByName("Mount Baker");
    const date = "2026-10-15";
    const primary = { SNWD: snwdMap(date, [0]) };
    const backupValues = Array.from({ length: 18 }, () => 0);
    const backup = { SNWD: snwdMap(date, backupValues), TOBS: snwdMap(date, Array(18).fill(30)) };
    const obs = buildDailyObservation({
      resort: baker,
      date,
      primaryElements: primary,
      backupElements: backup,
      capturedAt: new Date("2026-10-16T13:15:00Z"),
    });
    assert.equal(obs.stationTriplet, "1011:WA:SNTL");
    assert.equal(obs.stationRole, "backup");
    assert.equal(obs.quality, "sparse_fallback");
    assert.ok(obs.flags.includes("partial"));
    assert.equal(obs.newSnowIn, 0);
    assert.equal(chooseStation(4.2, 70.8, 50, true), "backup");
    assert.equal(chooseStation(80, 70, 50, true), "primary");
    assert.equal(chooseStation(10, 4, 50, true), "primary");
  });

  it("marks Stowe snwd_derived and Mammoth distant", () => {
    const date = "2026-10-15";
    const full = {
      SNWD: snwdMap(date, Array.from({ length: 24 }, () => 2)),
      TOBS: snwdMap(date, Array.from({ length: 24 }, (_, hour) => 30 + (hour % 5))),
    };
    const stowe = buildDailyObservation({
      resort: resortByName("Stowe"),
      date,
      primaryElements: full,
      backupElements: null,
      capturedAt: new Date("2026-10-16T13:15:00Z"),
    });
    assert.equal(stowe.stationTriplet, "2041:VT:SCAN");
    assert.equal(stowe.quality, "snwd_derived");
    assert.equal(stowe.method, "positive_snwd_change");
    assert.equal(stowe.newSnowIn, 0);
    assert.equal(stowe.hourly.length, 24);

    const mammoth = buildDailyObservation({
      resort: resortByName("Mammoth"),
      date,
      primaryElements: full,
      backupElements: null,
      capturedAt: new Date("2026-10-16T13:15:00Z"),
    });
    assert.equal(mammoth.quality, "distant");
    assert.equal(mammoth.stationTriplet, "846:CA:SNTL");

    const missing = qualityFor({
      resort: resortByName("Vail"),
      role: "primary",
      coveragePct: 0,
      snwdSamples: 0,
    });
    assert.equal(missing.quality, "missing");
  });

  it("drops SNWD chatter when the day never falls below 35F", () => {
    const date = "2026-10-15";
    const resort = {
      resort: "Warm Hill",
      timezone: "America/Los_Angeles",
      qualityFlag: null,
      fallbackOnSparseSnwd: false,
      settlingToleranceIn: 0.3,
      primary: { triplet: "1:WA:SNTL", name: "Test" },
    };
    const snwd = Array.from({ length: 24 }, () => 0);
    snwd[1] = 1;
    snwd[2] = 1;
    snwd[4] = 1;
    const obs = buildDailyObservation({
      resort,
      date,
      primaryElements: {
        SNWD: snwdMap(date, snwd),
        TOBS: snwdMap(date, Array.from({ length: 24 }, () => 52)),
      },
      backupElements: null,
      capturedAt: new Date("2026-10-16T13:15:00Z"),
    });
    assert.equal(obs.snwdIncreaseIn, 1);
    assert.equal(obs.newSnowIn, 0);
    assert.equal(obs.quality, "warm_snwd");
    assert.ok(obs.flags.includes("warm_snwd"));
  });
});
