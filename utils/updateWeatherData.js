import { getCountryModel } from "../utils/getCountryModel.js";

export const updateWeatherData = async (
  locations,
  fetchFn,
  dataKey,
  country
) => {
  const lastChecked = new Date();
  console.log(
    `Starting weather update for ${locations.length} locations in ${country}...`
  );

  const CountryModel = getCountryModel(country);

  const results = await Promise.allSettled(
    locations.map(async (location) => {
      try {
        const { Latitude, Longitude, _id, resortName } = location;

        console.log(
          `Fetching weather for: ${resortName} (${Latitude}, ${Longitude})`
        );

        const weatherData = await fetchFn(Latitude, Longitude);

        if (!weatherData || !weatherData.forecast) {
          console.warn(`Skipping: ${resortName} - No weather data.`);
          return {
            locationId: _id,
            success: false,
            error: "No valid weather data",
          };
        }

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

        console.log(`Updating weather for: ${resortName} (${_id})`);

        await CountryModel.findOneAndUpdate(
          { _id },
          {
            $set: {
              [`weatherData.${dataKey}.forecast`]: forecast,
              [`weatherData.${dataKey}.uom`]: uom,
              lastChecked,
            },
          },
          { upsert: true, new: true }
        );

        return { locationId: _id, success: true };
      } catch (error) {
        console.error(
          `Error updating weather for ${location.resortName}:`,
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

  console.log(`Weather update for ${country} completed.`);
  return results;
};
