import ResortWeatherData from "../models/resortWeatherData.model.js";
import { Resort } from "../models/resorts.model.js";

export const updateWeatherData = async (resorts, fetchFn, dataKey) => {
  const lastChecked = new Date();

  console.log(`Updating weather data for ${resorts.length} resorts...`);

  const results = await Promise.allSettled(
    resorts.map(async (resort) => {
      try {
        // Fetch weather data for the resort's coordinates
        const weatherData = await fetchFn(resort.Latitude, resort.Longitude);

        if (!weatherData || !weatherData.forecast) {
          throw new Error(
            `No data fetched for coordinates: ${resort.Latitude}, ${resort.Longitude}`
          );
        }

        // Find the actual resort in the database
        const matchedResort = await Resort.findOne({
          Latitude: resort.Latitude,
          Longitude: resort.Longitude,
        });

        if (!matchedResort) {
          throw new Error(
            `No matching resort found for coordinates: ${resort.Latitude}, ${resort.Longitude}`
          );
        }

        // Ensure the uom defaults to 'metric' if not provided
        const uom = weatherData.uom || "metric";

        // Update or insert weather data for the matched resort
        await ResortWeatherData.findOneAndUpdate(
          { resortId: matchedResort._id },
          {
            $set: {
              resortId: matchedResort._id,
              resortName: matchedResort.resortName,
              [`weatherData.${dataKey}.forecast`]: weatherData.forecast,
              [`weatherData.${dataKey}.uom`]: uom,
              lastChecked,
            },
          },
          { upsert: true, new: true }
        );

        console.log(
          `Successfully updated weather data for ${matchedResort.resortName}`
        );
        return { resortId: matchedResort._id, success: true };
      } catch (error) {
        console.error(
          `Error updating weather data for resort at ${resort.Latitude}, ${resort.Longitude}:`,
          error.message
        );
        return {
          resortId: resort._id || null,
          success: false,
          error: error.message,
        };
      }
    })
  );

  // Summarize results
  const summary = results.reduce(
    (acc, result) => {
      if (result.status === "fulfilled") {
        acc.success.push(result.value);
      } else {
        acc.failed.push(result.reason);
      }
      return acc;
    },
    { success: [], failed: [] }
  );

  console.log(
    `Weather data update completed: ${summary.success.length} succeeded, ${summary.failed.length} failed.`
  );
  if (summary.failed.length > 0) {
    console.error("Failed updates:", summary.failed);
  }

  return summary;
};
