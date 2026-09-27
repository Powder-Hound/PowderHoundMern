import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  STORM_ALERT_LEAD_DAYS,
  STORM_ALERT_MAX_SEASON_DAYS,
  isPowderAlertCronEnabled,
  isWithinOpeningAlertWindow,
  openingAlertWindowStatus,
} from "../utils/stormAlertGate.js";

const NOW = new Date("2026-09-15T12:00:00.000Z");

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

describe("16-day followed-resort opening gate", () => {
  it("uses a 16-day lead", () => {
    assert.equal(STORM_ALERT_LEAD_DAYS, 16);
    assert.equal(STORM_ALERT_MAX_SEASON_DAYS, 240);
  });

  it("fail-closes with no season.start (typical live resort rows)", () => {
    assert.equal(isWithinOpeningAlertWindow(undefined, NOW), false);
    assert.equal(isWithinOpeningAlertWindow({}, NOW), false);
    assert.equal(openingAlertWindowStatus({}, NOW).reason, "missing_opening_date");
  });

  it("blocks more than 16 days before opening (15 Sep vs 15 Nov)", () => {
    const status = openingAlertWindowStatus(
      { start: "2026-11-15T00:00:00.000Z" },
      NOW
    );
    assert.equal(status.allowed, false);
    assert.equal(status.reason, "before_lead_window");
  });

  it("opens exactly 16 days before opening", () => {
    const status = openingAlertWindowStatus(
      { start: "2026-10-01T00:00:00.000Z" },
      NOW
    );
    assert.equal(status.allowed, true);
    assert.equal(status.reason, "within_opening_window");
  });

  it("stays open after opening while season.end is in the future", () => {
    const status = openingAlertWindowStatus(
      {
        start: "2026-09-01T00:00:00.000Z",
        end: "2027-04-30T00:00:00.000Z",
      },
      NOW
    );
    assert.equal(status.allowed, true);
  });

  it("closes after season.end", () => {
    const status = openingAlertWindowStatus(
      {
        start: "2025-11-15T00:00:00.000Z",
        end: "2026-04-15T00:00:00.000Z",
      },
      NOW
    );
    assert.equal(status.allowed, false);
    assert.equal(status.reason, "after_season_end");
  });

  it("fail-closes stale last-season opening dates with no end", () => {
    const status = openingAlertWindowStatus(
      { start: "2025-11-15T00:00:00.000Z" },
      NOW
    );
    assert.equal(status.allowed, false);
    assert.equal(status.reason, "stale_opening_date");
  });
});
