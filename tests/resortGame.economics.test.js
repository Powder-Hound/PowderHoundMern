import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  CAVEAT,
  anchorById,
  economicsSourcePack,
  usedCatalog,
} from "../game/economics.config.js";
import { isResortGameEnabled } from "../game/flag.js";
import { buildProfile } from "../game/resortProfile.js";

describe("economics source pack", () => {
  it("loads 59 anchors and 20 unsourced gaps", () => {
    assert.equal(economicsSourcePack.anchors.length, 59);
    assert.equal(economicsSourcePack.unsourced.length, 20);
  });

  it("keeps a URL, year, and confidence on every sourced anchor", () => {
    for (const row of economicsSourcePack.anchors) {
      assert.ok(row.url, row.id);
      assert.ok(row.year, row.id);
      assert.ok(row.confidence, row.id);
      assert.ok(row.source, row.id);
      assert.ok(row.status === "SOURCED" || row.status === "DERIVED_FROM_SOURCED");
    }
  });

  it("tags every constant the day model uses", () => {
    const rows = usedCatalog();
    assert.ok(rows.length > 59);
    for (const row of rows) {
      assert.ok(row.status, row.id);
      assert.ok(row.id, "missing id");
      if (row.status === "UNSOURCED") {
        assert.ok(row.placeholder_range, `${row.id} missing placeholder range`);
      }
      if (row.status === "SOURCED" || row.status === "DERIVED_FROM_SOURCED") {
        assert.ok(row.url, row.id);
        assert.ok(row.year, row.id);
        assert.ok(row.confidence, row.id);
        assert.ok(row.source_id, row.id);
      }
    }
  });

  it("uses the Vail and NSAA anchors the brief called out", () => {
    assert.equal(anchorById("rev_per_visit_vail").value.FY2026, 163.62);
    assert.equal(anchorById("opex_per_visit_vail").value.FY2026, 116);
    assert.equal(anchorById("ticket_yield_2425").value, 75);
    assert.match(CAVEAT, /163\.62/);
    assert.match(CAVEAT, /paywalled|NSAA/);
  });
});

describe("resort classification", () => {
  const start = "2026-12-05";

  it("uses a sourced window price for a named mountain", () => {
    const vail = buildProfile({ _id: "1", resortName: "Vail", State: "Colorado" }, start);
    assert.equal(vail.sizeClass, "extra-large");
    assert.equal(vail.region, "Rocky Mountain");
    assert.equal(vail.marketAnchor, 374);
    assert.equal(vail.decisionMax, 392);
    assert.ok(vail.comfortableCapacity > vail.avgDailyVisits);
  });

  it("does not confuse Beaver Mountain with Beaver Creek", () => {
    const beaver = buildProfile(
      { _id: "2", resortName: "Beaver Mountain", State: "Utah" },
      start
    );
    const creek = buildProfile(
      { _id: "3", resortName: "Beaver Creek", State: "Colorado" },
      start
    );
    assert.equal(beaver.sizeClass, "small");
    assert.equal(beaver.acres, 800);
    assert.equal(creek.sizeClass, "extra-large");
    assert.equal(creek.marketAnchor, 392);
  });

  it("defaults an unnamed resort to medium in its NSAA region", () => {
    const cherry = buildProfile(
      { _id: "4", resortName: "Cherry Peak Resort", State: "Utah" },
      start
    );
    assert.equal(cherry.sizeClass, "medium");
    assert.equal(cherry.sizeSource, "default_medium");
    assert.equal(cherry.region, "Rocky Mountain");
    assert.equal(cherry.marketAnchor, 199);
    assert.ok(cherry.fairDayPrice < cherry.marketAnchor);
  });
});

describe("ENABLE_RESORT_GAME", () => {
  it("is off unless the value is exactly the string true", () => {
    assert.equal(isResortGameEnabled({}), false);
    assert.equal(isResortGameEnabled({ ENABLE_RESORT_GAME: "false" }), false);
    assert.equal(isResortGameEnabled({ ENABLE_RESORT_GAME: "TRUE" }), false);
    assert.equal(isResortGameEnabled({ ENABLE_RESORT_GAME: "1" }), false);
    assert.equal(isResortGameEnabled({ ENABLE_RESORT_GAME: true }), false);
    assert.equal(isResortGameEnabled({ ENABLE_RESORT_GAME: "true" }), true);
  });

  it("is not switched on from index.js", () => {
    const source = readFileSync(new URL("../index.js", import.meta.url), "utf8");
    const cron = readFileSync(new URL("../cron/visualCrossingCron.js", import.meta.url), "utf8");
    assert.match(source, /\/api\/resort-game/);
    assert.doesNotMatch(source, /ENABLE_RESORT_GAME\s*=/);
    assert.match(cron, /ENABLE_POWDER_ALERT_CRON === "true"/);
  });
});
