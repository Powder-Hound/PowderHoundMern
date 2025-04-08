import cron from "node-cron";
import { getAllResorts } from "../utils/mongoResortHelper.js";
import { fetchVisualCrossing } from "../externalAPI/visualCrossingAPI.js";
import { updateWeatherData } from "../utils/updateWeatherData.js";
import { fetchVisualCrossingAlerts } from "../services/weatherAlertService.js";

const startVisualCrossingCron = () => {
  // Global Weather Data Update (averaged to ~6:30 UTC)
  cron.schedule("30 6 * * *", async () => {
    console.log("⏳ Running global Visual Crossing weather data update...");

    try {
      // Fetch all resorts
      const resorts = await getAllResorts();
      if (!resorts || resorts.length === 0) {
        console.warn("⚠️ No resorts found for global weather data update.");
        return;
      }

      console.log(`📌 Found ${resorts.length} resorts to update.`);

      // Batch update weather data for resorts
      const results = await Promise.allSettled(
        resorts.map((resort) =>
          updateWeatherData([resort], fetchVisualCrossing, "visualCrossing")
        )
      );

      // Summarize results
      const summary = results.reduce(
        (acc, result) => {
          if (result.status === "fulfilled") {
            acc.success += 1;
          } else {
            acc.failed += 1;
            acc.errors.push(result.reason.message || "Unknown error");
          }
          return acc;
        },
        { success: 0, failed: 0, errors: [] }
      );

      console.log("✅ Global Visual Crossing weather data update completed.");
      console.log(
        `✅ Success: ${summary.success}, ❌ Failed: ${summary.failed}`
      );
      if (summary.errors.length > 0) {
        console.error("⚠️ Errors:", summary.errors);
      }
    } catch (err) {
      console.error(
        "❌ Error during global Visual Crossing update:",
        err.message
      );
    }
  }, {
    timezone: "MST/MDT"
  });

  // Global Snow Alert Notification (averaged to ~14:30 UTC)
  cron.schedule("30 14 * * *", async () => {
    console.log("🚀 Running global Visual Crossing notification task...");
    try {
      await fetchVisualCrossingAlerts();
      console.log("✅ Global Visual Crossing alerts sent successfully.");
    } catch (err) {
      console.error("❌ Error during global alert task:", err.message);
    }
  });

  console.log("🚀 Global Visual Crossing cron jobs initialized.");
};

export default startVisualCrossingCron;
