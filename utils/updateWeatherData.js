import ResortWeatherData from "../models/resortWeatherData.model.js";
import { Resort } from "../models/resorts.model.js";
import { Feature } from "../models/Feature.js";

export const updateWeatherData = async (
  locations,
  fetchFn,
  dataKey,
  modelType = "Resort"
) => {
  const lastChecked = new Date();
  const isFeatureModel = modelType === "Feature";

  console.log(
    `Starting weather data update for ${locations.length} locations (${modelType})...`
  );

  const results = await Promise.allSettled(
    locations.map(async (location) => {
      try {
        // Fetch weather data for the location's coordinates
        console.log(
          `Fetching weather data for coordinates: ${location.Latitude}, ${location.Longitude}`
        );
        const weatherData = await fetchFn(
          location.Latitude,
          location.Longitude
        );

        if (!weatherData || !weatherData.forecast) {
          throw new Error(
            `No forecast data fetched for coordinates: ${location.Latitude}, ${location.Longitude}`
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

        // Find the matching location in the database
        console.log(
          `Finding matching ${modelType} for coordinates: ${location.Latitude}, ${location.Longitude}`
        );

        const matchedLocation = await (isFeatureModel
          ? Feature.findOne({
              Latitude: location.Latitude,
              Longitude: location.Longitude,
            })
          : Resort.findOne({
              Latitude: location.Latitude,
              Longitude: location.Longitude,
            }));

        if (!matchedLocation) {
          throw new Error(
            `No matching ${modelType} found for coordinates: ${location.Latitude}, ${location.Longitude}`
          );
        }

        // Update or insert weather data for the matched location
        console.log(
          `Updating weather data for ${modelType}: ${
            matchedLocation.resortName || matchedLocation.name
          }`
        );

        await ResortWeatherData.findOneAndUpdate(
          { resortId: matchedLocation._id },
          {
            $set: {
              resortId: matchedLocation._id,
              resortName: matchedLocation.resortName || matchedLocation.name,
              [`weatherData.${dataKey}.forecast`]: forecast,
              [`weatherData.${dataKey}.uom`]: uom,
              lastChecked,
            },
          },
          { upsert: true, new: true }
        );

        console.log(
          `Successfully updated weather data for ${modelType}: ${
            matchedLocation.resortName || matchedLocation.name
          }`
        );

        return { locationId: matchedLocation._id, success: true };
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
