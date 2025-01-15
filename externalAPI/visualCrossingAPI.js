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
    const cacheKey = `${lat},${long}`;
    const cachedData = weatherCache.get(cacheKey);

    if (cachedData) {
      console.log(`Cache hit for ${lat}, ${long}`);
      return cachedData;
    }

    const today = new Date();
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - 1); // Start from yesterday
    const endDate = new Date(today);
    endDate.setDate(today.getDate() + 14); // Include 14 more days

    const startDateStr = startDate.toISOString().split("T")[0];
    const endDateStr = endDate.toISOString().split("T")[0];

    console.log(`Fetching data from ${startDateStr} to ${endDateStr}`);
    const response = await fetch(
      `${API_URL}/${lat},${long}/${startDateStr}/${endDateStr}?unitGroup=metric&key=${API_KEY}&include=days&elements=tempmax,tempmin,snow,precip,windspeed,humidity,conditions`
    );

    if (!response.ok) {
      throw new Error(`Error fetching data: ${response.statusText}`);
    }

    const data = await response.json();
    console.log("Raw API Response:", JSON.stringify(data, null, 2));

    const forecast = data.days.map((day, index) => {
      const today = new Date();
      const derivedDate = new Date(today);
      derivedDate.setDate(today.getDate() + index - 1); // Start from yesterday
      return {
        validTime: day.datetime || derivedDate.toISOString().split("T")[0],
        snow: { value: day.snow || 0, snowDepth: day.snowdepth || 0 },
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
      };
    });

    console.log("Mapped Forecast Data:", JSON.stringify(forecast, null, 2));

    const processedData = { forecast, uom: data.units || "metric" };
    weatherCache.set(cacheKey, processedData);

    return processedData;
  } catch (err) {
    console.error("Error fetching Visual Crossing data:", err);
    throw err;
  }
};
