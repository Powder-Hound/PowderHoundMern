import ResortWeatherData from "../models/resortWeatherData.model.js";
import { fetchVisualCrossing } from "../externalAPI/visualCrossingAPI.js";
import { getAllResorts } from "../utils/mongoResortHelper.js";
import { updateWeatherData } from "../utils/updateWeatherData.js";

// Function to get all weather data
export const getAllWeatherData = async (req, res) => {
  try {
    const allWeatherData = await ResortWeatherData.find();
    res.status(200).send(allWeatherData);
  } catch (err) {
    console.error("Error fetching all weather data:", err);
    res.status(500).send({ message: "Internal server error" });
  }
};

// Function to update Visual Crossing data
export const updateAllVisualCrossingData = async (req, res) => {
  try {
    const resorts = await getAllResorts();

    if (!resorts || resorts.length === 0) {
      console.error("No resorts found.");
      if (res) return res.status(404).send({ message: "No resorts found." });
    }

    const results = await updateWeatherData(
      resorts,
      fetchVisualCrossing,
      "visualCrossing"
    );

    console.log("VisualCrossing Data update complete.");
    if (res)
      res
        .status(200)
        .send({ message: "Weather data updated for all resorts", results });
  } catch (err) {
    console.error("Error in updating VisualCrossing data:", err);
    if (res) res.status(500).send({ message: "Internal server error" });
  }
};
