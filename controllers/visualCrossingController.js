import mongoose from "mongoose";
import ResortWeatherData from "../models/resortWeatherData.model.js";
import { fetchVisualCrossing } from "../externalAPI/visualCrossingAPI.js";
import { getAllResorts } from "../utils/mongoResortHelper.js";
import { updateWeatherData } from "../utils/updateWeatherData.js";

// Destructure ObjectId from mongoose.Types
const { ObjectId } = mongoose.Types;

// Function to get all weather data
export const getAllWeatherData = async (req, res) => {
  try {
    const weatherData = await ResortWeatherData.find();
    const enrichedWeatherData = weatherData.map((data) => ({
      resortId: data.resortId,
      resortName: data.resortName || "Unknown Resort",
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
    const resorts = await getAllResorts();
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
    console.error("Error in updating Visual Crossing data:", err);
    res.status(500).send({ message: "Internal server error" });
  }
};

// Function to fetch weather data for a list of ResortIDs
export const findListOfWeatherData = async (req, res) => {
  try {
    let ids = req.query.ids;

    if (typeof ids === "string") {
      ids = ids.split(","); // Split comma-separated IDs
    }

    // Ensure `ObjectId` is used properly with `mongoose.Types.ObjectId`
    const objectIds = ids.map((id) => new mongoose.Types.ObjectId(id.trim())); // Trim whitespace, just in case
    console.log("Converted Object IDs:", objectIds);

    // Query the database for matching resortIds
    const weatherData = await ResortWeatherData.find({
      resortId: { $in: objectIds },
    });

    console.log("Queried Weather Data:", weatherData);

    if (weatherData && weatherData.length > 0) {
      res.status(200).send({ success: true, data: weatherData });
    } else {
      res.status(404).send({
        success: false,
        message: "No weather data found for the provided resorts",
      });
    }
  } catch (err) {
    console.error("Error fetching weather data for list:", err);
    res.status(500).send({ message: "Internal server error" });
  }
};
