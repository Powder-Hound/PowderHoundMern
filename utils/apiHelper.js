import dotenv from "dotenv";
dotenv.config();

const API_BASE_URL = "https://api.weatherunlocked.com/api/resortforecast";
const APP_ID = process.env.UNLOCKED_WEATHER_API_ID;
const APP_KEY = process.env.UNLOCKED_WEATHER_API_KEY;

export const buildEndpoint = (resortId) => {
  return `${API_BASE_URL}/${resortId}?app_id=${APP_ID}&app_key=${APP_KEY}`;
};

export const mapForecastData = (forecast) => {
  return forecast.map((entry) => ({
    date: entry.date || "N/A",
    time: entry.time || "N/A",
    clouds: {
      low: entry.lowcloud_pct ?? 0,
      mid: entry.midcloud_pct ?? 0,
      high: entry.highcloud_pct ?? 0,
      total: entry.totalcloud_pct ?? 0,
    },
    freezingLevel: {
      feet: entry.frzglvl_ft ?? "N/A",
      meters: entry.frzglvl_m ?? "N/A",
    },
    precipitation: {
      mm: entry.precip_mm ?? 0,
      inches: entry.precip_in ?? 0,
      snow: { mm: entry.snow_mm ?? 0, inches: entry.snow_in ?? 0 },
    },
    humidity: entry.hum_pct ?? 0,
    visibility: { km: entry.vis_km ?? "N/A", miles: entry.vis_mi ?? "N/A" },
    pressure: { mb: entry.slp_mb ?? "N/A", inches: entry.slp_in ?? "N/A" },
    levels: {
      base: entry.base || {},
      mid: entry.mid || {},
      upper: entry.upper || {},
    },
  }));
};

export const getAllResorts = async (query) => {
  // Fetch resorts based on query (MongoDB logic)
};
