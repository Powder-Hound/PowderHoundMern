import fetch from "node-fetch";
import dotenv from "dotenv";
import NodeCache from "node-cache"; // Add caching for API responses

dotenv.config();

const API_URL =
  "https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline";
const API_KEY = process.env.VISUALCROSSING_KEY;

// Initialize cache with a 1-hour TTL
const weatherCache = new NodeCache({ stdTTL: 3600 });

export const fetchVisualCrossing = async (lat, long) => {
  try {
    const cacheKey = `${lat},${long}`; // Use location as the cache key
    const cachedData = weatherCache.get(cacheKey);

    if (cachedData) {
      console.log(`Cache hit for ${lat}, ${long}`);
      return cachedData;
    }

    console.log(`Fetching data for ${lat}, ${long} from Visual Crossing API`);
    const response = await fetch(
      `${API_URL}/${lat},${long}?unitGroup=metric&key=${API_KEY}&include=days&elements=tempmax,tempmin,snow,precip,windspeed,humidity,conditions`
    );

    if (!response.ok) {
      throw new Error(`Error fetching data: ${response.statusText}`);
    }

    const data = await response.json();

    const forecast = data.days.map((day) => ({
      validTime: day.datetime, // Add validTime from API response
      snow: {
        value: day.snow || 0,
        snowDepth: day.snowdepth || 0,
      },
      temperature: {
        max: day.tempmax || null,
        min: day.tempmin || null,
        avg: day.temp || null,
      },
      wind: {
        speed: day.windspeed || null,
        gust: day.windgust || null,
        direction: day.winddir || null,
      },
      precipitation: {
        value: day.precip || null,
        type: day.preciptype || [],
        prob: day.precipprob || null,
      },
      humidity: day.humidity || null,
      conditions: day.conditions || "Unknown",
    }));

    const processedData = { forecast, uom: data.units || "metric" };

    // Cache the processed data
    weatherCache.set(cacheKey, processedData);

    return processedData;
  } catch (err) {
    console.error("Error fetching Visual Crossing data:", err);
    throw err;
  }
};
