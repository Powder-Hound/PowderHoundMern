import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import {
  applyForecastPoint,
  applyGuard,
  planForecastPointMigration,
} from "../utils/forecastPointMigration.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const catalog = JSON.parse(readFileSync(join(root, "data/forecastPoints.json"), "utf8"));
const seed = JSON.parse(readFileSync(join(root, "data/resorts.json"), "utf8"));

describe("forecast point migration", () => {
  it("matches all 40 seed resorts by id and name and changes each once", () => {
    const plan = planForecastPointMigration(seed, catalog.resorts);
    assert.equal(catalog.resorts.length, 40);
    assert.equal(plan.changes.length, 40);
    assert.equal(plan.unchanged.length, 0);
    assert.equal(plan.missing.length, 0);
    assert.equal(plan.nameMismatches.length, 0);
    assert.equal(catalog.skipped.length, 1);
    assert.equal(catalog.skipped[0].resortName, "The Summit at Snoqualmie");
  });

  it("is idempotent and does not move the stored base coordinates", () => {
    const targets = new Map(catalog.resorts.map((record) => [record.resortId, record]));
    const resorts = seed.filter(
      (resort) => resort._id?.$oid && targets.has(resort._id.$oid)
    );
    const once = resorts.map((resort) =>
      applyForecastPoint(resort, targets.get(resort._id.$oid))
    );
    const twice = once.map((resort) =>
      applyForecastPoint(resort, targets.get(resort._id.$oid))
    );

    assert.equal(once.length, 40);
    once.forEach((resort, index) => {
      assert.equal(resort.Latitude, resorts[index].Latitude);
      assert.equal(resort.Longitude, resorts[index].Longitude);
      assert.deepEqual(resort.forecastPoint, twice[index].forecastPoint);
    });

    const again = planForecastPointMigration(once, catalog.resorts);
    assert.equal(again.changes.length, 0);
    assert.equal(again.unchanged.length, 40);
    assert.equal(again.missing.length, 0);
  });

  it("does not update a resort when the seed name does not match the id", () => {
    const record = catalog.resorts[0];
    const plan = planForecastPointMigration(
      [
        {
          _id: { $oid: record.resortId },
          resortName: "Not The Resort",
          Latitude: 1,
          Longitude: 2,
        },
      ],
      [record]
    );
    assert.equal(plan.changes.length, 0);
    assert.equal(plan.nameMismatches.length, 1);
  });

  it("stays a dry-run unless apply is explicitly confirmed outside production", () => {
    assert.deepEqual(applyGuard(["--help"]), { apply: false });
    assert.equal(applyGuard(["--apply"]).apply, false);
    assert.match(applyGuard(["--apply"]).reason, /confirm-not-production/);
    assert.equal(
      applyGuard(["--apply", "--confirm-not-production"], { NODE_ENV: "production" }).apply,
      false
    );
    assert.equal(
      applyGuard(["--apply", "--confirm-not-production"], { NODE_ENV: "development" }).apply,
      true
    );
  });
});
