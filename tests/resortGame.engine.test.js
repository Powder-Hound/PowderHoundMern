import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { defaultSeasonStart, isWeekend } from "../game/calendar.js";
import { E } from "../game/economics.config.js";
import { createInitialState, resolveDay } from "../game/simulate.js";
import { referenceProfile } from "../game/stress.js";
import { normalizeForecastDay, snowmakingWindow, syntheticDay } from "../game/weather.js";

describe("weather normalization", () => {
  it("converts a standard-unit forecast day into cm, C, and km/h", () => {
    const day = normalizeForecastDay(
      {
        validTime: "2026-12-12",
        snow: { value: 1, snowDepth: 12 },
        temperature: { max: 32, min: 14, avg: 23 },
        wind: { speed: 10, gust: 20 },
        precipitation: { value: 0.1, type: ["snow"] },
        humidity: 80,
      },
      "standard",
      "2026-12-12"
    );
    assert.equal(day.snowfallCm, E.cmPerInch);
    assert.equal(day.snowDepthCm, 12 * E.cmPerInch);
    assert.ok(Math.abs(day.tempAvgC - ((23 - E.fahrenheitOffset) / E.fahrenheitScale)) < 1e-9);
    assert.equal(day.windKmh, 10 * E.kmPerMile);
    assert.equal(day.rain, false);
  });

  it("keeps a metric forecast and flags rain", () => {
    const day = normalizeForecastDay(
      {
        validTime: "2026-12-12",
        snow: { value: 0 },
        temperature: { avg: 4, min: 2, max: 6 },
        wind: { speed: 12 },
        precipitation: { value: 8, type: ["rain"] },
      },
      "metric",
      "2026-12-12"
    );
    assert.equal(day.snowfallCm, 0);
    assert.equal(day.tempAvgC, 4);
    assert.equal(day.precipMm, 8);
    assert.equal(day.rain, true);
  });

  it("closes the snowmaking window when the overnight temperature is unknown", () => {
    const closed = snowmakingWindow(syntheticDay("2026-12-12", {
      tempMinC: null,
      tempAvgC: null,
      humidity: null,
    }));
    assert.equal(closed.efficiency, 0);
    assert.equal(closed.open, false);
    const open = snowmakingWindow(syntheticDay("2026-12-12", {
      tempMinC: -12,
      humidity: null,
    }));
    assert.equal(open.efficiency, 1);
  });
});

describe("day resolver", () => {
  it("is deterministic for the same seed, decisions, and weather", () => {
    const run = () => {
      const profile = referenceProfile();
      const state = createInitialState({
        profile,
        startDate: profile.seasonStart,
        seed: 7,
        userId: "a",
        initialDepthCm: 60,
      });
      return resolveDay(
        state,
        {
          liftTicketPrice: profile.marketAnchor,
          snowmakingBudget: 0,
          groomingSchedule: "full",
          terrainOpen: ["beginner", "intermediate", "advanced"],
          staffingLevel: profile.standardHeadcount,
          marketingSpend: profile.marketingReference,
          bigBet: null,
        },
        syntheticDay(profile.seasonStart, { humidity: null })
      );
    };
    assert.deepEqual(run(), run());
  });

  it("degrades when the forecast is missing", () => {
    const profile = referenceProfile();
    const state = createInitialState({
      profile,
      startDate: "2026-12-08",
      seed: 3,
      userId: "a",
      initialDepthCm: 50,
    });
    state.calendar.currentDate = "2026-12-08";
    const played = resolveDay(
      state,
      {
        liftTicketPrice: profile.fairDayPrice,
        snowmakingBudget: 1000,
        groomingSchedule: "partial",
        terrainOpen: ["beginner"],
        staffingLevel: profile.standardHeadcount,
        marketingSpend: 0,
        bigBet: null,
      },
      {
        date: "2026-12-08",
        source: "missing",
        reason: "date_not_in_forecast",
        snowfallCm: 0,
        tempAvgC: null,
        tempMinC: null,
        tempMaxC: null,
        windKmh: null,
        windGustKmh: null,
        precipMm: 0,
        precipType: [],
        humidity: null,
        rain: false,
      }
    );
    assert.equal(played.ok, true);
    assert.ok(played.result.weather.impacts.includes("forecast_missing"));
    assert.equal(played.result.snow.snowmakingEfficiency, 0);
    assert.equal(played.result.snow.queuedCm, 0);
    assert.ok(Number.isFinite(played.result.visits.total));
    assert.ok(played.result.visits.total <= profile.comfortableCapacity);
  });

  it("refuses another day after the 12 prime weeks", () => {
    const profile = referenceProfile();
    const state = createInitialState({
      profile,
      startDate: profile.seasonStart,
      seed: 1,
      userId: "a",
      initialDepthCm: 40,
    });
    state.calendar.dayIndex = E.seasonDays;
    state.calendar.status = "closed";
    const played = resolveDay(state, {}, syntheticDay(profile.seasonStart));
    assert.equal(played.ok, false);
    assert.equal(played.error, "season_closed");
  });
});

describe("default season start", () => {
  it("picks a Saturday on or after December 1 and not before today", () => {
    const start = defaultSeasonStart("2026-11-13");
    assert.ok(start >= "2026-12-01");
    assert.ok(start < "2026-12-08");
    assert.equal(isWeekend(start), true);
  });
});
