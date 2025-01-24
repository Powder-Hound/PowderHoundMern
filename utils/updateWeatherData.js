//updateWeatherData.js
import { getResortWeatherDataModel } from "../models/resortWeatherData.model.js";

export const updateWeatherData = async (
  locations,
  fetchFn,
  dataKey,
  region
) => {
  const lastChecked = new Date();
  console.log(
    `Starting weather data update for ${locations.length} locations in ${region}...`
  );

  // Get the region-specific model
  const ResortWeatherData = getResortWeatherDataModel(region);

  const results = await Promise.allSettled(
    locations.map(async (location) => {
      try {
        const { Latitude, Longitude, _id, resortName } = location;

        console.log(
          `Fetching weather data for coordinates: ${Latitude}, ${Longitude}`
        );

        // Fetch weather data
        const weatherData = await fetchFn(Latitude, Longitude);

        // SCRUB: Skip locations with invalid or missing weather data
        if (
          !weatherData ||
          !weatherData.forecast ||
          !weatherData.forecast.length
        ) {
          console.warn(
            `Skipping location (${
              resortName || "Unknown"
            }) - No valid weather data found.`
          );
          return {
            locationId: _id,
            success: false,
            error: "No valid weather data",
          };
        }

        // Format and filter forecast data
        const forecast = weatherData.forecast.map((day) => ({
          validTime: day.validTime,
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

        const uom = weatherData.uom || "metric";

        console.log(`Updating weather data for resort: ${resortName} (${_id})`);

        // Update or insert valid weather data into the database
        await ResortWeatherData.findOneAndUpdate(
          { resortId: _id },
          {
            $set: {
              resortId: _id,
              resortName: resortName || "Unknown",
              [`weatherData.${dataKey}.forecast`]: forecast,
              [`weatherData.${dataKey}.uom`]: uom,
              lastChecked,
            },
          },
          { upsert: true, new: true }
        );

        console.log(
          `Successfully updated weather data for resort: ${resortName} (${_id})`
        );

        return { locationId: _id, success: true };
      } catch (error) {
        console.error(
          `Error updating weather data for coordinates: ${location.Latitude}, ${location.Longitude}:`,
          error.message
        );
        return {
          locationId: location._id || null,
          success: false,
          error: error.message,
        };
      }
    })
  );

  const summary = results.reduce(
    (acc, result) => {
      if (result.status === "fulfilled" && result.value.success) {
        acc.success.push(result.value);
      } else {
        acc.failed.push(result.reason || result.value);
      }
      return acc;
    },
    { success: [], failed: [] }
  );

  console.log(
    `Weather data update completed for ${region}: ${summary.success.length} succeeded, ${summary.failed.length} failed.`
  );

  return summary;
};
