import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as gate from "../utils/stormAlertGate.js";
import { isPowderAlertCronEnabled } from "../utils/stormAlertGate.js";

describe("ENABLE_POWDER_ALERT_CRON remains off unless exactly true", () => {
  it("rejects unset, false, TRUE, and 1", () => {
    assert.equal(isPowderAlertCronEnabled({}), false);
    assert.equal(isPowderAlertCronEnabled({ ENABLE_POWDER_ALERT_CRON: "false" }), false);
    assert.equal(isPowderAlertCronEnabled({ ENABLE_POWDER_ALERT_CRON: "TRUE" }), false);
    assert.equal(isPowderAlertCronEnabled({ ENABLE_POWDER_ALERT_CRON: "1" }), false);
    assert.equal(isPowderAlertCronEnabled({ ENABLE_POWDER_ALERT_CRON: true }), false);
  });

  it("allows only the string true", () => {
    assert.equal(
      isPowderAlertCronEnabled({ ENABLE_POWDER_ALERT_CRON: "true" }),
      true
    );
  });
});

describe("16-day followed-resort opening gate is retired", () => {
  it("no longer exports the lead window or season-date checks", () => {
    assert.equal("STORM_ALERT_LEAD_DAYS" in gate, false);
    assert.equal("STORM_ALERT_MAX_SEASON_DAYS" in gate, false);
    assert.equal("openingAlertWindowStatus" in gate, false);
    assert.equal("isWithinOpeningAlertWindow" in gate, false);
  });

  it("keeps the cron env lock and drops the 16-day clause from the lock message", () => {
    assert.equal(gate.POWDER_ALERT_CRON_ENV, "ENABLE_POWDER_ALERT_CRON");
    assert.match(gate.STORM_ALERTS_LOCKED_MESSAGE, /ENABLE_POWDER_ALERT_CRON/);
    assert.doesNotMatch(gate.STORM_ALERTS_LOCKED_MESSAGE, /16 days/);
  });
});
