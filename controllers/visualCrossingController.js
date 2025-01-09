import ResortWeatherData from "../models/resortWeatherData.model.js";
import { fetchVisualCrossing } from "../externalAPI/visualCrossingAPI.js";
import { getAllResorts } from "../utils/mongoResortHelper.js";
import { updateWeatherData } from "../utils/updateWeatherData.js";

// Function to get all weather data
export const getAllWeatherData = async (req, res) => {
  try {
    // Fetch all weather data
    const weatherData = await ResortWeatherData.find();

    // Enrich weather data with resort names
    const enrichedWeatherData = weatherData.map((data) => ({
      resortId: data.resortId,
      resortName: data.resortName || "Unknown Resort", // Use the correct field
      ...data.toObject(),
    }));

    res.status(200).send(enrichedWeatherData);
  } catch (err) {
    console.error("Error fetching all weather data:", err);
    res.status(500).send({ message: "Internal server error" });
  }
};

// Function to update Visual Crossing data
export const updateAllVisualCrossingData = async (req, res) => {
  try {
    const resorts = await getAllResorts(); // Fetch all resorts with Latitude and Longitude

    if (!resorts || resorts.length === 0) {
      console.error("No resorts found.");
      return res.status(404).send({ message: "No resorts found." });
    }

    const results = await updateWeatherData(
      resorts,
      fetchVisualCrossing,
      "visualCrossing"
    );

    console.log("VisualCrossing Data update complete.");
    res
      .status(200)
      .send({ message: "Weather data updated for all resorts", results });
  } catch (err) {
    console.error("Error in updating VisualCrossing data:", err);
    res.status(500).send({ message: "Internal server error" });
  }
};
