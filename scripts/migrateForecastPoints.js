/**
 * Set resort.forecastPoint from data/forecastPoints.json.
 *
 * Dry-run is the default. It reads data/resorts.json and does not connect
 * to MongoDB.
 *
 *   node scripts/migrateForecastPoints.js
 *
 * Writing requires both flags and a non-production NODE_ENV. Do not point
 * MONGODB_URI at production.
 *
 *   NODE_ENV=development node scripts/migrateForecastPoints.js --apply --confirm-not-production
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  applyGuard,
  formatDryRunTable,
  forecastPointFromRecord,
  planForecastPointMigration,
} from "../utils/forecastPointMigration.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

export function loadForecastPointInputs() {
  const points = JSON.parse(
    fs.readFileSync(path.join(root, "data/forecastPoints.json"), "utf8")
  );
  const resorts = JSON.parse(
    fs.readFileSync(path.join(root, "data/resorts.json"), "utf8")
  );
  return { points, resorts };
}

function printPlan(plan) {
  console.log(formatDryRunTable(plan.changes));
  console.log("");
  console.log(
    `Changes: ${plan.changes.length}. Unchanged: ${plan.unchanged.length}. Missing: ${plan.missing.length}. Name mismatches: ${plan.nameMismatches.length}.`
  );
  if (plan.missing.length) {
    console.log(
      "Missing from data/resorts.json:",
      plan.missing.map((row) => row.resortName).join(", ")
    );
  }
  if (plan.nameMismatches.length) {
    console.log("Name mismatches:", JSON.stringify(plan.nameMismatches));
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const guard = applyGuard(argv);
  const { points, resorts } = loadForecastPointInputs();
  const plan = planForecastPointMigration(resorts, points.resorts);
  printPlan(plan);

  if (plan.nameMismatches.length || plan.missing.length) {
    console.error("Refusing to continue until every forecast point matches a seed resort id and name.");
    process.exit(1);
  }

  if (!guard.apply) {
    console.log(
      guard.reason
        ? `Dry-run only (${guard.reason}). No database writes.`
        : "Dry-run only. No database writes."
    );
    return;
  }

  const dotenv = await import("dotenv");
  dotenv.config({ path: path.join(root, ".env") });
  const { connectDB } = await import("../config/db.js");
  const { Resort } = await import("../models/resorts.model.js");
  await connectDB();

  let modified = 0;
  for (const record of points.resorts) {
    const result = await Resort.updateOne(
      { _id: record.resortId, resortName: record.resortName },
      { $set: { forecastPoint: forecastPointFromRecord(record) } }
    );
    modified += result.modifiedCount || 0;
    if (!result.matchedCount) {
      console.error(`No resort matched ${record.resortName} (${record.resortId}).`);
    }
  }
  console.log(`Applied forecast points. Modified documents: ${modified}.`);
  process.exit(0);
}

const isDirectRun =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
