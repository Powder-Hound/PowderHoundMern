import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

const API_URL =
  "https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline";
const API_KEY = process.env.VISUALCROSSING_KEY;

export const fetchVisualCrossing = async (lat, long) => {
  try {
    const response = await fetch(
      `${API_URL}/${lat},${long}?unitGroup=metric&key=${API_KEY}`
    );
    if (!response.ok) {
      throw new Error(`Error fetching data: ${response.statusText}`);
    }

    const data = await response.json();

    const forecast = data.days.map((day) => ({
      validTime: day.datetime,
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
      pressure: day.pressure || null,
      visibility: day.visibility || null,
      cloudCover: day.cloudcover || null,
      uvIndex: day.uvindex || null,
      conditions: day.conditions || "Unknown",
    }));

    return { forecast, uom: data.units || "metric" };
  } catch (err) {
    console.error("Error fetching Visual Crossing data:", err);
    throw err;
  }
};
