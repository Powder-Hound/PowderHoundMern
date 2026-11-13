import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { E } from "../game/economics.config.js";
import { runStress } from "../game/stress.js";

const report = runStress();
const byId = Object.fromEntries(report.scenarios.map((scenario) => [scenario.id, scenario]));

describe("stress harness", () => {
  it("passes every scripted scenario", () => {
    assert.deepEqual(report.failed, []);
  });

  it("keeps visits, money, depth, and satisfaction inside physical bounds", () => {
    for (const scenario of report.scenarios) {
      assert.equal((scenario.problems || []).length, 0, scenario.id);
    }
    assert.equal(report.sweep.problems, 0);
    assert.equal(report.sweep.cells, 480);
  });

  it("sells out a Christmas powder Saturday and craters day tickets when the price is high on thin snow", () => {
    const powder = byId["powder-weekend"];
    assert.ok(powder.unconstrained > powder.capacity);
    assert.ok(Math.abs(powder.visits - powder.capacity) < 1e-6);
    assert.equal(powder.cappedBy, "capacity");
    const priced = byId["price-maximum-low-snow"];
    assert.ok(priced.dayVisitRatioVersusAnchor < 0.6);
    assert.ok(Math.abs(priced.passVisits - priced.anchorPassVisits) < 1e-6);
  });

  it("punishes lean staffing, late snowmaking, ungroomed snow, and a repeated big bet", () => {
    const lean = byId["lean-staff-powder"];
    assert.ok(lean.satisfaction < lean.surgeSatisfaction);
    assert.ok(lean.visits < lean.surgeVisits);
    const snow = byId["snowmaking-lag"];
    assert.ok(snow.sameDayDepth < E.openDepthCm);
    assert.ok(snow.earlyDepth >= E.openDepthCm);
    assert.ok(snow.lateDepth < snow.earlyDepth);
    const groom = byId.grooming;
    assert.ok(groom.satisfaction < groom.fullSatisfaction);
    assert.equal(byId["big-bet-spam"].accepted, 3);
    assert.equal(byId["big-bet-spam"].rejected, 3);
  });

  it("shows diminishing marketing and a quiet day near the revenue anchor", () => {
    const marketing = byId["marketing-diminishing"];
    assert.ok(marketing.step2 < marketing.step1);
    assert.ok(marketing.stepMax <= marketing.step2);
    const fair = byId["fair-price-weekday"];
    assert.ok(Math.abs(fair.revenuePerVisit - report.profile.revenuePerVisit) / report.profile.revenuePerVisit < 0.15);
  });

  it("finds no strategy that wins every weather case", () => {
    assert.equal(report.sweep.dominant, null);
    const prices = new Set(
      Object.values(report.sweep.bestByScenario).map((row) => Math.round(row.price))
    );
    assert.ok(prices.size > 1);
  });

  it("survives 100 autopilot days and a wind hold", () => {
    assert.equal(byId["autopilot-100"].days, 100);
    assert.equal(byId["wind-hold-extreme-cold"].visits, 0);
    assert.equal(byId["zero-staff"].visits, 0);
    assert.equal(byId["zero-snow-december"].visits, 0);
    assert.ok(byId["rain-event"].visitRatio < 0.6);
  });
});
