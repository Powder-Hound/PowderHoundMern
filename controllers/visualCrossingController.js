import mongoose from "mongoose";
import ResortWeatherData from "../models/resortWeatherData.model.js";
import { fetchVisualCrossing } from "../externalAPI/visualCrossingAPI.js";
import { getAllResorts } from "../utils/mongoResortHelper.js";
import { updateWeatherData } from "../utils/updateWeatherData.js";

// Function to get all weather data
export const getAllWeatherData = async (req, res) => {
  try {
    const { page = 1, limit = 10, resortName, startDate, endDate } = req.query;

    const query = {};
    if (resortName) query.resortName = new RegExp(resortName, "i");
    if (startDate || endDate) {
      query["weatherData.visualCrossing.forecast.validTime"] = {};
      if (startDate)
        query["weatherData.visualCrossing.forecast.validTime"].$gte = startDate;
      if (endDate)
        query["weatherData.visualCrossing.forecast.validTime"].$lte = endDate;
    }

    const weatherData = await ResortWeatherData.find(query)
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await ResortWeatherData.countDocuments(query);

    res.status(200).json({
      success: true,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      data: weatherData,
    });
  } catch (err) {
    console.error("Error fetching all weather data:", err);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// Function to update Visual Crossing data
export const updateAllVisualCrossingData = async (req, res) => {
  try {
    const resorts = await getAllResorts();

    if (!resorts || resorts.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "No resorts found." });
    }

    const results = await updateWeatherData(
      resorts,
      fetchVisualCrossing,
      "visualCrossing"
    );

    const successCount = results.success.length;
    const failedCount = results.failed.length;

    res.status(200).json({
      success: true,
      message: `Weather data update completed: ${successCount} succeeded, ${failedCount} failed.`,
      results,
    });
  } catch (err) {
    console.error("Error updating Visual Crossing data:", err);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// Function to fetch weather data for a list of ResortIDs
export const findListOfWeatherData = async (req, res) => {
  try {
    let { ids, page = 1, limit = 10 } = req.query;

    if (!ids) {
      return res
        .status(400)
        .json({ success: false, message: "No resort IDs provided." });
    }

    if (typeof ids === "string") {
      ids = ids.split(",").map((id) => id.trim());
    }

    const objectIds = ids.map((id) => new mongoose.Types.ObjectId(id));
    const query = { resortId: { $in: objectIds } };

    const weatherData = await ResortWeatherData.find(query)
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await ResortWeatherData.countDocuments(query);

    res.status(200).json({
      success: true,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      data: weatherData,
    });
  } catch (err) {
    console.error("Error fetching weather data for list:", err);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// Function to fetch weather data from the last 24 hours
export const getLast24HoursWeatherData = async (req, res) => {
  try {
    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const { page = 1, limit = 10 } = req.query;

    const weatherData = await ResortWeatherData.find({
      lastChecked: { $gte: twentyFourHoursAgo, $lte: now },
    })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await ResortWeatherData.countDocuments({
      lastChecked: { $gte: twentyFourHoursAgo, $lte: now },
    });

    if (weatherData.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No weather data found for the last 24 hours.",
      });
    }

    res.status(200).json({
      success: true,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      data: weatherData,
    });
  } catch (err) {
    console.error("Error fetching last 24 hours of weather data:", err);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// Function to fetch weather alerts
export const getWeatherAlerts = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;

    const weatherData = await ResortWeatherData.find({
      "weatherData.visualCrossing.forecast.conditions": { $regex: /alert/i },
    })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    if (weatherData.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No weather alerts found.",
      });
    }

    res.status(200).json({ success: true, data: weatherData });
  } catch (err) {
    console.error("Error fetching weather alerts:", err);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// Function to fetch weather summary for a date range
export const getWeatherSummary = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: "Start date and end date are required.",
      });
    }

    const weatherData = await ResortWeatherData.aggregate([
      { $unwind: "$weatherData.visualCrossing.forecast" },
      {
        $match: {
          "weatherData.visualCrossing.forecast.validTime": {
            $gte: startDate,
            $lte: endDate,
          },
        },
      },
      {
        $group: {
          _id: null,
          avgTemperature: {
            $avg: "$weatherData.visualCrossing.forecast.temperature.avg",
          },
          totalSnowfall: {
            $sum: "$weatherData.visualCrossing.forecast.snow.value",
          },
          totalPrecipitation: {
            $sum: "$weatherData.visualCrossing.forecast.precipitation.value",
          },
        },
      },
    ]);

    if (!weatherData.length) {
      return res.status(404).json({
        success: false,
        message: "No weather data found for the specified range.",
      });
    }

    res.status(200).json({ success: true, data: weatherData[0] });
  } catch (err) {
    console.error("Error fetching weather summary:", err);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// Function to fetch forecast for a specific date
export const getForecastByDate = async (req, res) => {
  try {
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({
        success: false,
        message: "A valid date parameter is required in YYYY-MM-DD format.",
      });
    }

    const weatherData = await ResortWeatherData.find({
      "weatherData.visualCrossing.forecast.validTime": date,
    });

    if (weatherData.length === 0) {
      return res.status(404).json({
        success: false,
        message: `No weather forecast found for date: ${date}.`,
      });
    }

    res.status(200).json({ success: true, data: weatherData });
  } catch (err) {
    console.error("Error fetching forecast by date:", err);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};
