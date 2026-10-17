import cron from "node-cron";
import { ACCURACY_RESORTS } from "../config/forecastAccuracyStations.js";
import { captureForecasts } from "../services/forecastAccuracy/capture.js";
import { pullSnotel } from "../services/forecastAccuracy/snotel.js";
import {
  upsertForecastSnapshots,
  upsertObservations,
} from "../services/forecastAccuracy/store.js";
import { isForecastAccuracyCronEnabled } from "../utils/forecastAccuracyGate.js";

// Forecast-model accuracy capture for the 2026-27 season.
// Wired from index.js the same way as cron/visualCrossingCron.js, but this
// file does not import the alert service, the storm gate, or the powder flag.
//
// Times are UTC so they stay aligned with model cycles after the clocks change.
//
//   30 12 * * *  UTC   12:30Z capture after the 00Z cycle
//                      7:30 AM CDT / 6:30 AM CST
//   30 0 * * *   UTC   00:30Z capture after the 12Z cycle
//                      7:30 PM CDT / 6:30 PM CST (previous Central evening)
//   15 13 * * *  UTC   13:15Z SNOTEL rollup of the previous local day
//                      8:15 AM CDT / 7:15 AM CST / 6:15 AM PDT
//
// 12:30Z and 00:30Z are the first twice-daily slots that clear a ~10 hour
// ECMWF IFS 0.25 delay (00Z ready ~10Z, 12Z ready ~22Z). GFS seamless, ICON,
// NAM, and HRRR can be a newer cycle by then; runTime is stored per model.
// Both capture jobs and the SNOTEL job stay unscheduled unless
// ENABLE_FORECAST_ACCURACY_CRON is the exact string "true".

export const FORECAST_ACCURACY_SCHEDULES = [
  {
    name: "capture-after-00z",
    cron: "30 12 * * *",
    timezone: "UTC",
    ctCdt: "7:30 AM CDT",
    ctCst: "6:30 AM CST",
  },
  {
    name: "capture-after-12z",
    cron: "30 0 * * *",
    timezone: "UTC",
    ctCdt: "7:30 PM CDT",
    ctCst: "6:30 PM CST",
  },
  {
    name: "snotel-previous-local-day",
    cron: "15 13 * * *",
    timezone: "UTC",
    ctCdt: "8:15 AM CDT",
    ctCst: "7:15 AM CST",
  },
];

async function runCapture() {
  const { rows, errors } = await captureForecasts({ resorts: ACCURACY_RESORTS });
  if (errors.length) {
    console.error("⚠️ Forecast-accuracy capture errors:", errors);
  }
  const summary = await upsertForecastSnapshots(rows);
  console.log(
    `✅ Forecast-accuracy capture stored ${rows.length} rows`,
    summary
  );
}

async function runSnotel() {
  const { observations, errors } = await pullSnotel({ resorts: ACCURACY_RESORTS });
  if (errors.length) {
    console.error("⚠️ Forecast-accuracy SNOTEL errors:", errors);
  }
  const summary = await upsertObservations(observations);
  console.log(
    `✅ Forecast-accuracy SNOTEL stored ${observations.length} daily rows`,
    summary
  );
}

const startForecastAccuracyCron = () => {
  if (!isForecastAccuracyCronEnabled()) {
    console.log(
      "⛔ Forecast-accuracy cron not scheduled. ENABLE_FORECAST_ACCURACY_CRON is not true."
    );
    return;
  }

  for (const job of FORECAST_ACCURACY_SCHEDULES) {
    const task = job.name.startsWith("snotel") ? runSnotel : runCapture;
    cron.schedule(
      job.cron,
      async () => {
        console.log(`⏳ Forecast-accuracy ${job.name} (${job.cron} ${job.timezone})`);
        try {
          await task();
        } catch (err) {
          console.error(`❌ Forecast-accuracy ${job.name} failed:`, err.message);
        }
      },
      { timezone: job.timezone }
    );
  }

  console.log("🚀 Forecast-accuracy cron jobs initialized (capture 12:30Z & 00:30Z, SNOTEL 13:15Z).");
};

export default startForecastAccuracyCron;
