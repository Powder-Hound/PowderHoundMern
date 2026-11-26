import dotenv from "dotenv";
import mongoose from "mongoose";
import { selectResorts } from "../config/forecastAccuracyStations.js";
import { pullSnotel } from "../services/forecastAccuracy/snotel.js";
import { upsertObservations } from "../services/forecastAccuracy/store.js";
import { parseArgs, resolveNow } from "./accuracyArgs.js";
import { countBy, sampleRows, writeJson } from "./accuracyIo.js";

dotenv.config();

const help = `Usage: npm run accuracy:snotel -- [--dry-run] [--begin YYYY-MM-DD --end YYYY-MM-DD] [--resort Name] [--out dir]

Pulls NRCS AWDB hourly SNWD, WTEQ, TOBS, PREC and writes one daily observation per resort.
With no dates, each resort uses yesterday in its own timezone.
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
  const { observations, errors } = await pullSnotel({
    resorts,
    beginDate: args.begin,
    endDate: args.end,
    now,
  });
  const path = await writeJson(args.outDir, "observations.json", observations);
  console.log(
    JSON.stringify(
      {
        dryRun,
        capturedAt: now.toISOString(),
        begin: args.begin,
        end: args.end,
        rows: observations.length,
        byQuality: countBy(observations, "quality"),
        errors,
        file: path,
      },
      null,
      2
    )
  );
  console.log("--- sample rows (one per quality) ---");
  for (const row of sampleRows(observations)) {
    console.log(JSON.stringify(row));
  }
  if (!dryRun) {
    const { connectDB } = await import("../config/db.js");
    await connectDB();
    const summary = await upsertObservations(observations);
    console.log("Mongo upsert", summary);
    await mongoose.disconnect();
  }
  if (!observations.length && errors.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
