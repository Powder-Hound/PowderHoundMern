import cron from "node-cron";
import { getAllResorts } from "../utils/mongoResortHelper.js";
import { fetchVisualCrossing } from "../externalAPI/visualCrossingAPI.js";
import { updateWeatherData } from "../utils/updateWeatherData.js";
import { fetchVisualCrossingAlerts } from "../services/weatherAlertService.js";
import { sanitizeForecastError } from "../utils/forecastIngestSummary.js";
import {
  finalizeForecastIngest,
  runScheduledFreshnessCheck,
} from "../services/forecastMonitor.js";

const startVisualCrossingCron = () => {
  // Global Weather Data Update (averaged to ~6:30 UTC)
  cron.schedule("30 6 * * *", async () => {
    console.log("⏳ Running global Visual Crossing weather data update...");
    const startedAt = new Date();
    let summary = null;

    try {
      // Fetch all resorts. One Visual Crossing call per resort; no retries.
      const resorts = await getAllResorts();
      if (!resorts || resorts.length === 0) {
        console.warn("⚠️ No resorts found for global weather data update.");
        summary = await finalizeForecastIngest({
          startedAt,
          settledResults: [
            {
              status: "rejected",
              reason: new Error("No resorts found for global weather data update"),
              resortId: "ingest-job",
              resortName: "visual-crossing-ingest",
            },
          ],
        });
      } else {
        console.log(`📌 Found ${resorts.length} resorts to update.`);

        // Batch update weather data for resorts
        const settled = await Promise.allSettled(
          resorts.map((resort) =>
            updateWeatherData([resort], fetchVisualCrossing, "visualCrossing")
          )
        );
        const settledResults = settled.map((result, index) => ({
          ...result,
          resortId: resorts[index]?.resortId,
          resortName: resorts[index]?.resortName,
        }));
        summary = await finalizeForecastIngest({ startedAt, settledResults });
      }

      console.log("✅ Global Visual Crossing weather data update completed.");
      console.log(
        `✅ Success: ${summary.ok}, ❌ Failed: ${summary.failed}`
      );
    } catch (err) {
      console.error(
        "❌ Error during global Visual Crossing update:",
        sanitizeForecastError(err)
      );
      if (!summary) {
        try {
          await finalizeForecastIngest({
            startedAt,
            settledResults: [
              {
                status: "rejected",
                reason: err,
                resortId: "ingest-job",
                resortName: "visual-crossing-ingest",
              },
            ],
          });
        } catch (persistErr) {
          console.error(
            "ALERT forecast ingest could not record failure:",
            sanitizeForecastError(persistErr)
          );
        }
      }
    }
  }, {
    timezone: "MST"
  });

  // After the 06:30 MST ingest. Read-only freshness check; no Visual Crossing calls.
  cron.schedule("15 7 * * *", async () => {
    console.log("⏳ Running forecast freshness check...");
    try {
      const report = await runScheduledFreshnessCheck();
      console.log(
        `Forecast freshness ok=${report.ok} staleResorts=${report.staleCount} oldestLastChecked=${report.oldestLastChecked}`
      );
    } catch (err) {
      console.error(
        "ALERT forecast freshness check failed:",
        sanitizeForecastError(err)
      );
    }
  }, {
    timezone: "MST"
  });

  // Stick / storm SMS stays unscheduled until ENABLE_POWDER_ALERT_CRON is
  // exactly "true". The 16-day opening gate is retired; this env check is
  // the remaining schedule lock. Do not set the env var in code.
  if (process.env.ENABLE_POWDER_ALERT_CRON === "true") {
    cron.schedule("30 14 * * *", async () => {
      console.log("🚀 Running global Visual Crossing notification task...");
      try {
        await fetchVisualCrossingAlerts();
        console.log("✅ Global Visual Crossing alerts sent successfully.");
      } catch (err) {
        console.error("❌ Error during global alert task:", err.message);
      }
    });
  } else {
    console.log(
      "⛔ Powder-alert cron (14:30) not scheduled. ENABLE_POWDER_ALERT_CRON is not true."
    );
  }

  console.log("🚀 Global Visual Crossing cron jobs initialized.");
};

export default startVisualCrossingCron;
