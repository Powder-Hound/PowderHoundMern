import { fetchVisualCrossing } from "../externalAPI/visualCrossingAPI.js";
import ResortWeatherData from "../models/resortWeatherData.model.js";
import { getAllResorts } from "../chron/mongoResortHelper.js";

/**
 * Update weather data for all resorts
 */
export const updateAllVisualCrossingData = async (req, res) => {
  try {
    const fullResortsWithCoords = await getAllResorts();

    if (!fullResortsWithCoords || fullResortsWithCoords.length === 0) {
      console.error("No resorts found.");
      return res.status(404).json({ message: "No resorts found." });
    }

    for (const resort of fullResortsWithCoords) {
      try {
        const resortName = resort.name || "Unknown Resort";

        const { forecast, uom } = await fetchVisualCrossing(
          resort.Latitude,
          resort.Longitude
        );

        await ResortWeatherData.findOneAndUpdate(
          { resortId: resort.resortId },
          {
            $set: {
              "weatherData.visualCrossing.forecast": forecast,
              "weatherData.visualCrossing.uom": uom,
              lastChecked: new Date(),
            },
          },
          { upsert: true, new: true }
        );

        process.stdout.write(`\rUpdated weather data for: ${resortName}`);
      } catch (err) {
        console.error(
          `Error updating data for resort ${resort.resortId}:`,
          err
        );
      }
    }

    console.log("\nVisualCrossing Data update complete.");
    res.status(200).json({ message: "Weather data updated for all resorts" });
  } catch (err) {
    console.error("Error in updating VisualCrossing data:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * Get all weather data from the database
 */
export const getAllWeatherData = async (req, res) => {
  try {
    const data = await ResortWeatherData.find();
    res.status(200).json(data);
  } catch (err) {
    console.error("Error fetching all weather data:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};
