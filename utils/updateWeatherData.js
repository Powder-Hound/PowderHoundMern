import ResortWeatherData from "../models/resortWeatherData.model.js";

export const updateWeatherData = async (resorts, fetchFn, dataKey) => {
  const results = [];
  const lastChecked = new Date();

  for (const resort of resorts) {
    try {
      // Fetch weather data for the resort
      const weatherData = await fetchFn(resort.Latitude, resort.Longitude);

      if (!weatherData || !weatherData.forecast) {
        console.error(`No data fetched for resort ${resort.resortId}`);
        results.push({ resortId: resort.resortId, success: false });
        continue;
      }

      // Update the database
      await ResortWeatherData.findOneAndUpdate(
        { resortId: resort.resortId },
        {
          $set: {
            [`weatherData.${dataKey}.forecast`]: weatherData.forecast,
            [`weatherData.${dataKey}.uom`]: weatherData.uom,
            lastChecked,
          },
        },
        { upsert: true, new: true }
      );

      console.log(`Updated weather data for: ${resort.name || "Unknown"}`);
      results.push({ resortId: resort.resortId, success: true });
    } catch (err) {
      console.error(
        `Error updating data for resort ${resort.resortId}:`,
        err.message
      );
      results.push({ resortId: resort.resortId, success: false, error: err });
    }
  }

  return results;
};
