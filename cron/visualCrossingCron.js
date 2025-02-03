import cron from "node-cron";
import { getAllResorts } from "../utils/mongoResortHelper.js";
import { fetchVisualCrossing } from "../externalAPI/visualCrossingAPI.js";
import { updateWeatherData } from "../utils/updateWeatherData.js";
import { fetchVisualCrossingAlerts } from "../services/weatherAlertService.js";

const startVisualCrossingCron = () => {
  // ⏳ Daily Weather Data Update at Midnight (00:00 UTC)
  cron.schedule("0 0 * * *", async () => {
    console.log("⏳ Running scheduled Visual Crossing weather data update...");

    try {
      // Fetch all resorts
      const resorts = await getAllResorts();
      if (!resorts || resorts.length === 0) {
        console.warn("⚠️ No resorts found for scheduled weather data update.");
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

      console.log(
        "✅ Scheduled Visual Crossing weather data update completed."
      );
      console.log(
        `✅ Success: ${summary.success}, ❌ Failed: ${summary.failed}`
      );
      if (summary.errors.length > 0) {
        console.error("⚠️ Errors:", summary.errors);
      }
    } catch (err) {
      console.error(
        "❌ Error during scheduled Visual Crossing update:",
        err.message
      );
    }
  });

  // ⏳ Snow Alert Notification Every 6 Hours
  cron.schedule("0 */6 * * *", async () => {
    console.log("Running scheduled Visual Crossing alert task...");
    try {
      await fetchVisualCrossingAlerts(); // ✅ UPDATED FUNCTION NAME
      console.log("Visual Crossing alerts sent successfully.");
    } catch (err) {
      console.error("Error during scheduled alert task:", err.message);
    }
  });

  console.log("🚀 Visual Crossing cron jobs initialized.");
};

export default startVisualCrossingCron;
