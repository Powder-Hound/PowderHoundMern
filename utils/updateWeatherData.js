import ResortWeatherData from "../models/resortWeatherData.model.js";
import { Resort } from "../models/resorts.model.js";
import {
  formatFailureLine,
  sanitizeForecastError,
  summarizeForecastBatch,
} from "./forecastIngestSummary.js";

export const updateWeatherData = async (resorts, fetchFn, dataKey) => {
  const lastChecked = new Date();

  console.log(`Starting weather data update for ${resorts.length} resorts...`);

  const results = await Promise.allSettled(
    resorts.map(async (resort) => {
      const resortId = resort.resortId || resort._id || null;
      const resortName = resort.resortName || null;
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
        return {
          resortId: matchedResort._id,
          resortName: matchedResort.resortName,
          success: true,
        };
      } catch (error) {
        const safeError = sanitizeForecastError(error);
        console.error(
          `Error updating weather data for resortId=${resortId || "unknown"} resortName=${resortName || "unknown"} coordinates: ${resort.Latitude}, ${resort.Longitude}:`,
          safeError
        );
        return {
          resortId,
          resortName,
          success: false,
          error: safeError,
        };
      }
    })
  );

  // {success:false} is a failure even though the promise fulfilled.
  const summary = summarizeForecastBatch(results);

  console.log(
    `Weather data update completed: ${summary.ok} succeeded, ${summary.failed} failed.`
  );

  if (summary.failed > 0) {
    console.error(
      "Failed updates:",
      summary.failures.map((failure) => formatFailureLine(failure)).join("; ")
    );
  }

  return {
    success: summary.successes,
    failed: summary.failures,
  };
};
