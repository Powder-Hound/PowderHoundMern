import cron from "node-cron";
import { getRegionModel } from "../../utils/regionHelper.js";
import { fetchVisualCrossing } from "../../externalAPI/visualCrossingAPI.js";
import { updateWeatherData } from "../../utils/updateWeatherData.js";
import { fetchSnowAlerts } from "../../services/weatherAlertService.js";

const startVisualCrossingCron = () => {
  const scheduleCronForRegion = (region, cronTime) => {
    cron.schedule(cronTime, async () => {
      console.log(
        `Running scheduled weather data update for region: ${region}...`
      );
      try {
        // Fetch resorts for the specific region
        const RegionModel = getRegionModel(region);
        const resorts = await RegionModel.find();

        if (!resorts || resorts.length === 0) {
          console.warn(`No resorts found for region: ${region}.`);
          return;
        }

        console.log(
          `Found ${resorts.length} resorts to update in region: ${region}.`
        );

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
          `Weather data update completed for region: ${region}. Success: ${summary.success}, Failed: ${summary.failed}`
        );
        if (summary.errors.length > 0) {
          console.error(`Errors for region ${region}:`, summary.errors);
        }
      } catch (err) {
        console.error(
          `Error during scheduled update for region ${region}:`,
          err.message
        );
      }
    });
  };

  // Schedule jobs for each region at staggered times
  scheduleCronForRegion("us", "0 0 * * *"); // Midnight
  scheduleCronForRegion("europe", "30 0 * * *"); // 12:30 AM
  scheduleCronForRegion("japan", "0 1 * * *"); // 1:00 AM

  // New Snow Alerts Cron Job
  cron.schedule("0 */6 * * *", async () => {
    console.log("Running scheduled snow alert task...");
    try {
      await fetchSnowAlerts();
      console.log("Snow alerts sent successfully.");
    } catch (err) {
      console.error("Error during scheduled snow alert task:", err.message);
    }
  });

  console.log("Visual Crossing cron jobs initialized for all snow alerts.");
};

export default startVisualCrossingCron;
