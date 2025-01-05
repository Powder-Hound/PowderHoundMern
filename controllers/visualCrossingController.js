import { fetchVisualCrossing } from "../externalAPI/visualCrossingAPI.js";
import ResortWeatherData from "../models/resortWeatherData.model.js";
import { getAllResorts } from "../chron/mongoResortHelper.js";

const lastChecked = new Date().toISOString();

/**
 * Helper function to log progress
 * @param {number} current - Current progress
 * @param {number} total - Total resorts
 */
const logProgress = (current, total) => {
  process.stdout.write(
    `\r\x1b[K---Fetching VisualCrossing Data... (${current}/${total} fetched)`
  );
};

/**
 * Fetch and update weather data for all resorts
 */
export const updateAllVisualCrossingData = async (req, res) => {
  try {
    const fullResortsWithCoords = await getAllResorts();

    for (const resort of fullResortsWithCoords) {
      try {
        const [rawForecast, uom] = await fetchVisualCrossing(
          resort.Latitude,
          resort.Longitude
        );

        // Validate forecast keys
        const forecast = Object.entries(rawForecast).reduce(
          (acc, [key, value]) => {
            if (key && typeof key === "string") {
              acc[key] = value;
            } else {
              console.warn(
                `Invalid forecast key for resort ${resort.resortId}: ${key}`
              );
            }
            return acc;
          },
          {}
        );

        // Update the database with validated data
        await ResortWeatherData.findOneAndUpdate(
          { resortId: resort.resortId },
          {
            $set: {
              "weatherData.visualCrossing.forecast": forecast,
              lastChecked: new Date().toISOString(),
              "weatherData.visualCrossing.uom": uom,
            },
          },
          { upsert: true, new: true }
        );

        process.stdout.write(
          `\rFetching VisualCrossing Data... Resort: ${resort.resortId}`
        );
      } catch (err) {
        console.error(
          `Error fetching data for resort ${resort.resortId}:`,
          err
        );
      }
    }

    console.log("\nVisualCrossing Data updated");
    res.status(200).json({ message: "Weather data updated for all resorts" });
  } catch (err) {
    console.error("Error in updating VisualCrossing data:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * Fetch Visual Crossing data for a single location
 */
export const getVisualCrossingDataByLocation = async (req, res) => {
  const { lat, long } = req.params;

  try {
    const data = await fetchVisualCrossing(lat, long);

    if (data) {
      const [forecast, uom] = data;
      return res.status(200).json({ forecast, uom });
    } else {
      return res.status(404).json({ message: "No weather data found" });
    }
  } catch (err) {
    console.error("Error fetching VisualCrossing data:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};
