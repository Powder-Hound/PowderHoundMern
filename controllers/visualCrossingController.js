import { fetchVisualCrossing } from "../externalAPI/visualCrossingAPI.js";
import ResortWeatherData from "../models/resortWeatherData.model.js";
import { getAllResorts } from "../chron/mongoResortHelper.js";
import cron from "node-cron";

// Function to get all weather data
export const getAllWeatherData = async (req, res) => {
  try {
    const allWeatherData = await ResortWeatherData.find();
    res.status(200).json(allWeatherData);
  } catch (err) {
    console.error("Error fetching all weather data:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const updateAllVisualCrossingData = async (req, res) => {
  try {
    const fullResortsWithCoords = await getAllResorts();

    if (!fullResortsWithCoords || fullResortsWithCoords.length === 0) {
      console.error("No resorts found.");
      if (res) return res.status(404).json({ message: "No resorts found." });
    }

    for (const resort of fullResortsWithCoords) {
      try {
        const { forecast, uom } = await fetchVisualCrossing(
          resort.Latitude,
          resort.Longitude
        );

        const resortId = resort._id.toString(); // Use the _id as resortId

        await ResortWeatherData.findOneAndUpdate(
          { resortId }, // Match by correct resortId
          {
            $set: {
              "weatherData.visualCrossing.forecast": forecast,
              "weatherData.visualCrossing.uom": uom,
              lastChecked: new Date(),
            },
          },
          { upsert: true, new: true }
        );

        console.log(
          `Updated weather data for resort: ${resort["Ski Resort Name"]}`
        );
      } catch (err) {
        console.error(`Error updating data for resortId ${resort._id}:`, err);
      }
    }

    console.log("VisualCrossing Data update complete.");
    if (res)
      res.status(200).json({ message: "Weather data updated for all resorts" });
  } catch (err) {
    console.error("Error in updating VisualCrossing data:", err);
    if (res) res.status(500).json({ message: "Internal server error" });
  }
};

// Schedule cron job for updating every 5 minutes
cron.schedule("0 */3 * * *", async () => {
  console.log("Running scheduled weather data update (every 3 hours)...");
  await updateAllVisualCrossingData();
  console.log("Scheduled weather data update (every 3 hours) completed.");
});

export default {
  updateAllVisualCrossingData,
  getAllWeatherData, // Ensure this is exported
};
