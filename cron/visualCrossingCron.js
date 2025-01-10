import cron from "node-cron";
import { getAllResorts } from "../utils/mongoResortHelper.js";
import { fetchVisualCrossing } from "../externalAPI/visualCrossingAPI.js";
import { updateWeatherData } from "../utils/updateWeatherData.js";

const startVisualCrossingCron = () => {
  cron.schedule("0 0 * * *", async () => {
    console.log("Running scheduled Visual Crossing weather data update...");
    try {
      // Fetch resorts
      const resorts = await getAllResorts();

      // Call utility function to update weather data
      const results = await updateWeatherData(
        resorts,
        fetchVisualCrossing,
        "visualCrossing"
      );

      console.log("Scheduled Visual Crossing weather data update completed.");
      console.log("Update results:", results);
    } catch (err) {
      console.error(
        "Error during scheduled Visual Crossing update:",
        err.message
      );
    }
  });

  console.log("Visual Crossing cron job initialized.");
};

export default startVisualCrossingCron;
