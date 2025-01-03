import axios from "axios";
import { ResortWeatherData } from "../models/resortWeatherData.model.js";
import { buildEndpoint, mapForecastData } from "../utils/apiHelper.js";

export const fetchWeatherUnlockedData = async (resorts) => {
  const lastChecked = new Date().toISOString();

  for (let resort of resorts) {
    const { ID, Name } = resort;
    try {
      const endpoint = buildEndpoint(ID);
      const response = await axios.get(endpoint);

      const forecast = mapForecastData(response.data.forecast);
      await ResortWeatherData.findOneAndUpdate(
        { resortId: ID },
        {
          $set: {
            "weatherData.weatherUnlocked.forecast": forecast,
            lastChecked,
          },
        },
        { upsert: true, new: true }
      );
      console.log(`Weather data updated for ${Name}`);
    } catch (error) {
      console.error(`Error fetching data for ${Name}: ${error.message}`);
    }
  }
};
