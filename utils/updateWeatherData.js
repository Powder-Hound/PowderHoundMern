import ResortWeatherData from "../models/resortWeatherData.model.js";
import { Resort } from "../models/resorts.model.js";

export const updateWeatherData = async (resorts, fetchFn, dataKey) => {
  const results = [];
  const lastChecked = new Date();

  for (const resort of resorts) {
    try {
      // Fetch weather data for the resort's coordinates
      const weatherData = await fetchFn(resort.Latitude, resort.Longitude);

      if (!weatherData || !weatherData.forecast) {
        console.error(
          `No data fetched for resort with coordinates: ${resort.Latitude}, ${resort.Longitude}`
        );
        results.push({ resortId: resort._id, success: false });
        continue;
      }

      // Find the actual resort in the database by Latitude and Longitude
      const matchedResort = await Resort.findOne({
        Latitude: resort.Latitude,
        Longitude: resort.Longitude,
      });

      if (!matchedResort) {
        console.error(
          `No matching resort found for coordinates: ${resort.Latitude}, ${resort.Longitude}`
        );
        results.push({
          resortId: null,
          success: false,
          error: "No matching resort found",
        });
        continue;
      }

      // Log the matched resort
      console.log("Matched Resort:", matchedResort);

      // Update the weather data for the matched resort
      await ResortWeatherData.findOneAndUpdate(
        { resortId: matchedResort._id },
        {
          $set: {
            resortId: matchedResort._id,
            resortName: matchedResort.resortName, // Correct field for the resort name
            [`weatherData.${dataKey}.forecast`]: weatherData.forecast,
            [`weatherData.${dataKey}.uom`]: weatherData.uom,
            lastChecked,
          },
        },
        { upsert: true, new: true }
      );

      console.log(
        `Updated weather data for resort: ${matchedResort.resortName}`
      );
      results.push({ resortId: matchedResort._id, success: true });
    } catch (err) {
      console.error(
        `Error updating data for resort at ${resort.Latitude}, ${resort.Longitude}:`,
        err.message
      );
      results.push({
        resortId: resort._id,
        success: false,
        error: err.message,
      });
    }
  }

  return results;
};
