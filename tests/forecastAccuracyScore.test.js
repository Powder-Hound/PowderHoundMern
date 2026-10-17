import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderLeaderboardSvg } from "../services/forecastAccuracy/chart.js";
import { buildHeadline, leadBucket, scoreForecasts } from "../services/forecastAccuracy/score.js";

function forecast(overrides) {
  return {
    resort: "Alta",
    source: "open-meteo",
    model: "gfs_seamless",
    validDate: "2026-11-02",
    leadDays: 1,
    snowfallIn: 0,
    ...overrides,
  };
}

describe("lead buckets", () => {
  it("keeps 1-3, 4-7, and 8-16 and drops same-day and past 16", () => {
    assert.equal(leadBucket(0), null);
    assert.equal(leadBucket(1), "1-3");
    assert.equal(leadBucket(3), "1-3");
    assert.equal(leadBucket(4), "4-7");
    assert.equal(leadBucket(7), "4-7");
    assert.equal(leadBucket(8), "8-16");
    assert.equal(leadBucket(16), "8-16");
    assert.equal(leadBucket(17), null);
  });
});

describe("scorecard on partial and full pairs", () => {
  it("ranks MAE, counts hits, misses, and false alarms, and skips CPC", () => {
    const snapshots = [
      forecast({ model: "gfs_seamless", validDate: "2026-11-02", leadDays: 1, snowfallIn: 8 }),
      forecast({ model: "gfs_seamless", validDate: "2026-11-03", leadDays: 2, snowfallIn: 2 }),
      forecast({
        model: "ecmwf_ifs025",
        validDate: "2026-11-02",
        leadDays: 1,
        snowfallIn: 5,
      }),
      forecast({ model: "gfs_seamless", validDate: "2026-11-06", leadDays: 5, snowfallIn: 6 }),
      forecast({ model: "gfs_seamless", validDate: "2026-11-08", leadDays: 7, snowfallIn: 10 }),
      forecast({
        source: "cpc",
        model: "cpc_8_14",
        validDate: "2026-11-10",
        leadDays: 9,
        snowfallIn: null,
      }),
      forecast({ validDate: "2026-11-01", leadDays: 0, snowfallIn: 4 }),
      forecast({ validDate: "2026-11-20", leadDays: 20, snowfallIn: 4 }),
      forecast({ validDate: "2026-11-09", leadDays: 3, snowfallIn: 1 }),
    ];
    const observations = [
      { resort: "Alta", date: "2026-11-02", newSnowIn: 7 },
      { resort: "Alta", date: "2026-11-03", newSnowIn: 0 },
      { resort: "Alta", date: "2026-11-06", newSnowIn: 5 },
      { resort: "Alta", date: "2026-11-08", newSnowIn: 6 },
    ];
    const card = scoreForecasts(snapshots, observations);
    const short = card.buckets["1-3"].models;
    assert.equal(short[0].model, "gfs_seamless");
    assert.equal(short[0].rank, 1);
    assert.equal(short[0].n, 2);
    assert.equal(short[0].mae, 1.5);
    assert.equal(short[0].bias, 1.5);
    assert.equal(short[0].hits, 1);
    assert.equal(short[0].quiet, 1);
    assert.equal(short[0].hitRate, 1);
    assert.equal(short[1].model, "ecmwf_ifs025");
    assert.equal(short[1].misses, 1);
    assert.equal(short[1].hitRate, 0);
    assert.equal(short[1].mae, 2);

    const mid = card.buckets["4-7"].models[0];
    assert.equal(mid.model, "gfs_seamless");
    assert.equal(mid.hits, 1);
    assert.equal(mid.falseAlarms, 1);
    assert.equal(mid.n, 2);
    assert.equal(mid.mae, 2.5);

    assert.equal(card.buckets["8-16"].models.length, 0);
    assert.equal(card.skipped.noSnowfall, 1);
    assert.equal(card.skipped.leadOutOfRange, 2);
    assert.equal(card.skipped.noObservation, 1);
    assert.equal(card.headline.includes("\n"), false);
    assert.match(card.headline, /1-3d leader gfs_seamless MAE 1.50 in/);
    assert.match(card.headline, /8-16d no pairs/);

    const svg = renderLeaderboardSvg(card);
    assert.match(svg, /^<svg/);
    assert.match(svg, /gfs_seamless/);
    assert.match(svg, /No overlapping pairs/);
  });

  it("returns an empty scorecard without throwing", () => {
    const card = scoreForecasts([], []);
    assert.equal(card.pairCount, 0);
    assert.equal(card.buckets["1-3"].models.length, 0);
    assert.equal(
      buildHeadline(card),
      "No overlapping forecast/observation pairs in lead buckets 1-3, 4-7, or 8-16."
    );
    const svg = renderLeaderboardSvg(card);
    assert.match(svg, /No overlapping pairs/);
    assert.equal(svg.includes("\0"), false);
  });
});
