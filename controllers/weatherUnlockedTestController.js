import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const API_BASE_URL = "https://api.weatherunlocked.com/api/resortforecast";
const APP_ID = process.env.UNLOCKED_WEATHER_API_ID;
const APP_KEY = process.env.UNLOCKED_WEATHER_API_KEY;

export const fetchTestResortData = async (resortId) => {
  const endpoint = `${API_BASE_URL}/${resortId}?app_id=${APP_ID}&app_key=${APP_KEY}`;

  try {
    const response = await axios.get(endpoint);
    return response.data; // Return the fetched data
  } catch (error) {
    console.error("Error fetching test resort data:", error.message);
    throw new Error("Failed to fetch resort data");
  }
};
