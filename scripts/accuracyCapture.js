import dotenv from "dotenv";
import mongoose from "mongoose";
import { selectResorts } from "../config/forecastAccuracyStations.js";
import { captureForecasts } from "../services/forecastAccuracy/capture.js";
import { upsertForecastSnapshots } from "../services/forecastAccuracy/store.js";
import { parseArgs, resolveNow } from "./accuracyArgs.js";
import { countBy, sampleRows, writeJson } from "./accuracyIo.js";

dotenv.config();

const help = `Usage: npm run accuracy:capture -- [--dry-run] [--resort Name] [--now ISO] [--out dir]

Pulls Open-Meteo, NWS, CPC, and Visual Crossing once. Does not start cron.
--dry-run (or a missing MONGODB_URI) prints rows and skips Mongo writes.`;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(help);
    return;
  }
  let dryRun = args.dryRun;
  if (!dryRun && !process.env.MONGODB_URI) {
    console.warn("MONGODB_URI is not set. Running as --dry-run (no database writes).");
    dryRun = true;
  }
  const now = resolveNow(args);
  const resorts = selectResorts(args.resort);
  const { rows, errors } = await captureForecasts({ resorts, now });
  const path = await writeJson(args.outDir, "forecast_snapshots.json", rows);
  console.log(
    JSON.stringify(
      {
        dryRun,
        capturedAt: now.toISOString(),
        resorts: resorts.map((resort) => resort.resort),
        rows: rows.length,
        bySource: countBy(rows, "source"),
        byModel: countBy(rows, "model"),
        errors,
        file: path,
      },
      null,
      2
    )
  );
  console.log("--- sample rows (one per source) ---");
  for (const row of sampleRows(rows)) {
    console.log(JSON.stringify(row));
  }
  if (!dryRun) {
    const { connectDB } = await import("../config/db.js");
    await connectDB();
    const summary = await upsertForecastSnapshots(rows);
    console.log("Mongo upsert", summary);
    await mongoose.disconnect();
  }
  if (!rows.length && errors.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
