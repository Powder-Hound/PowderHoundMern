import ResortWeatherData from "../models/resortWeatherData.model.js";
import { Resort } from "../models/resorts.model.js";

export const updateWeatherData = async (resorts, fetchFn, dataKey) => {
  const lastChecked = new Date();

  console.log(`Starting weather data update for ${resorts.length} resorts...`);

  const results = await Promise.allSettled(
    resorts.map(async (resort) => {
      try {
        // Fetch weather data for the resort's coordinates
        console.log(
          `Fetching weather data for coordinates: ${resort.Latitude}, ${resort.Longitude}`
        );
        const weatherData = await fetchFn(resort.Latitude, resort.Longitude);

        if (!weatherData || !weatherData.forecast) {
          throw new Error(
            `No forecast data fetched for coordinates: ${resort.Latitude}, ${resort.Longitude}`
          );
        }

        // Validate and clean fetched forecast data
        const forecast = weatherData.forecast.map((day) => ({
          validTime: day.validTime, // Use the updated data structure with yesterday
          snow: day.snow || { value: 0, snowDepth: 0 },
          temperature: day.temperature || { max: null, min: null, avg: null },
          wind: day.wind || { speed: null, gust: null, direction: null },
          precipitation: day.precipitation || {
            value: null,
            type: [],
            prob: null,
          },
          humidity: day.humidity || null,
          pressure: day.pressure || null,
          visibility: day.visibility || null,
          cloudCover: day.cloudCover || null,
          uvIndex: day.uvIndex || null,
          conditions: day.conditions || "Unknown",
        }));

        // Ensure the uom defaults to 'metric'
        const uom = weatherData.uom || "metric";

        // Find the matching resort in the database
        console.log(
          `Finding matching resort for coordinates: ${resort.Latitude}, ${resort.Longitude}`
        );
        const matchedResort = await Resort.findOne({
          Latitude: resort.Latitude,
          Longitude: resort.Longitude,
        });

        if (!matchedResort) {
          throw new Error(
            `No matching resort found for coordinates: ${resort.Latitude}, ${resort.Longitude}`
          );
        }

        // Update or insert weather data for the matched resort
        console.log(
          `Updating weather data for resort: ${matchedResort.resortName}`
        );
        await ResortWeatherData.findOneAndUpdate(
          { resortId: matchedResort._id },
          {
            $set: {
              resortId: matchedResort._id,
              resortName: matchedResort.resortName,
              [`weatherData.${dataKey}.forecast`]: forecast,
              [`weatherData.${dataKey}.uom`]: uom,
              lastChecked,
            },
          },
          { upsert: true, new: true }
        );

        console.log(
          `Successfully updated weather data for resort: ${matchedResort.resortName}`
        );
        return { resortId: matchedResort._id, success: true };
      } catch (error) {
        console.error(
          `Error updating weather data for coordinates: ${resort.Latitude}, ${resort.Longitude}:`,
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
    console.error(
      "Failed updates:",
      summary.failed.map((failure) => failure.error || failure)
    );
  }

  return summary;
};
