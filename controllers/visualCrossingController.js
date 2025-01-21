import mongoose from "mongoose";
import { getRegionModel } from "../utils/regionHelper.js";
import ResortWeatherData from "../models/resortWeatherData.model.js";
import { updateWeatherData } from "../utils/updateWeatherData.js";
import { fetchVisualCrossing } from "../externalAPI/visualCrossingAPI.js";

// Get all weather data for a specific region
export const getAllWeatherDataByRegion = async (req, res) => {
  try {
    const { region } = req.params;
    const { resortName, startDate, endDate } = req.query;

    const RegionModel = getRegionModel(region);

    const query = {};
    if (resortName) query.resortName = new RegExp(resortName, "i");
    if (startDate || endDate) {
      query["weatherData.visualCrossing.forecast.validTime"] = {};
      if (startDate)
        query["weatherData.visualCrossing.forecast.validTime"].$gte = startDate;
      if (endDate)
        query["weatherData.visualCrossing.forecast.validTime"].$lte = endDate;
    }

    const weatherData = await ResortWeatherData.find(query).populate({
      path: "resortId",
      model: RegionModel,
    });

    res.status(200).send({
      success: true,
      data: weatherData,
    });
  } catch (err) {
    console.error("Error fetching weather data for region:", err);
    res.status(500).send({ success: false, message: "Internal server error" });
  }
};

// Update weather data for all locations in a region
export const updateAllVisualCrossingDataByRegion = async (req, res) => {
  try {
    const { region } = req.params;
    const RegionModel = getRegionModel(region);

    const locations = await RegionModel.find();

    if (!locations || locations.length === 0) {
      return res
        .status(404)
        .send({ success: false, message: `No locations found in ${region}.` });
    }

    const results = await updateWeatherData(
      locations,
      fetchVisualCrossing,
      "visualCrossing",
      "Feature"
    );

    const successCount = results.success.length;
    const failedCount = results.failed.length;

    res.status(200).send({
      success: true,
      message: `Weather data update completed for ${region}: ${successCount} succeeded, ${failedCount} failed.`,
      results,
    });
  } catch (err) {
    console.error("Error updating Visual Crossing data by region:", err);
    res.status(500).send({ success: false, message: "Internal server error" });
  }
};

// Get weather data for a list of IDs in a region
export const findListOfWeatherDataByRegion = async (req, res) => {
  try {
    const { region } = req.params;
    let { ids } = req.query;

    if (!ids) {
      return res
        .status(400)
        .send({ success: false, message: "No IDs provided." });
    }

    if (typeof ids === "string") {
      ids = ids.split(",").map((id) => id.trim());
    }

    const objectIds = ids.map((id) => new mongoose.Types.ObjectId(id));
    const RegionModel = getRegionModel(region);

    const query = { resortId: { $in: objectIds } };
    const weatherData = await ResortWeatherData.find(query).populate({
      path: "resortId",
      model: RegionModel,
    });

    res.status(200).send({
      success: true,
      data: weatherData,
    });
  } catch (err) {
    console.error("Error fetching weather data for list by region:", err);
    res.status(500).send({ success: false, message: "Internal server error" });
  }
};

// Get weather alerts for a specific region
export const getWeatherAlertsByRegion = async (req, res) => {
  try {
    const { region } = req.params;

    const query = {
      "weatherData.visualCrossing.forecast.conditions": { $regex: /alert/i },
    };

    const weatherData = await ResortWeatherData.find(query).populate({
      path: "resortId",
      model: getRegionModel(region),
    });

    if (!weatherData.length) {
      return res.status(200).send({
        success: true,
        data: [],
        message: "No weather alerts found.",
      });
    }

    res.status(200).send({
      success: true,
      data: weatherData,
    });
  } catch (err) {
    console.error("Error fetching weather alerts by region:", err);
    res.status(500).send({ success: false, message: "Internal server error." });
  }
};

export const getForecastByDateAndRegion = async (req, res) => {
  try {
    const { region } = req.params; // Extract the region from the URL
    const { date } = req.query; // Extract the date from the query parameters

    if (!date || isNaN(Date.parse(date))) {
      return res.status(400).send({
        success: false,
        message: "Invalid date format. Use YYYY-MM-DD.",
      });
    }

    const RegionModel = getRegionModel(region); // Dynamically get the region model

    if (!RegionModel) {
      return res.status(400).send({
        success: false,
        message: `Invalid region: ${region}.`,
      });
    }

    // Query weather data for the specified date
    const weatherData = await ResortWeatherData.find({
      "weatherData.visualCrossing.forecast": {
        $elemMatch: { validTime: date },
      },
    }).populate({
      path: "resortId",
      model: RegionModel,
    });

    if (!weatherData.length) {
      return res.status(200).send({
        success: true,
        data: [],
        message: `No forecast found for date: ${date} in region: ${region}.`,
      });
    }

    res.status(200).send({ success: true, data: weatherData });
  } catch (err) {
    console.error("Error fetching forecast by date and region:", err);
    res.status(500).send({ success: false, message: "Internal server error." });
  }
};

// Get weather summary for a specific date range in a region
export const getWeatherSummaryByRegion = async (req, res) => {
  try {
    const { region } = req.params;
    const { startDate, endDate } = req.query;

    if (
      !startDate ||
      !endDate ||
      isNaN(Date.parse(startDate)) ||
      isNaN(Date.parse(endDate))
    ) {
      return res
        .status(400)
        .send({ success: false, message: "Invalid start or end date." });
    }

    const RegionModel = getRegionModel(region);

    const summary = await ResortWeatherData.aggregate([
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
        $lookup: {
          from: RegionModel.collection.name,
          localField: "resortId",
          foreignField: "_id",
          as: "resortInfo",
        },
      },
      { $unwind: "$resortInfo" },
      {
        $group: {
          _id: "$resortInfo.resortName",
          avgTemperature: {
            $avg: "$weatherData.visualCrossing.forecast.temperature.avg",
          },
          totalSnowfall: {
            $sum: "$weatherData.visualCrossing.forecast.snow.value",
          },
          totalPrecipitation: {
            $sum: "$weatherData.visualCrossing.forecast.precipitation.value",
          },
          dates: {
            $addToSet: "$weatherData.visualCrossing.forecast.validTime",
          },
        },
      },
      {
        $project: {
          _id: 0,
          resortName: "$_id",
          avgTemperature: 1,
          totalSnowfall: 1,
          totalPrecipitation: 1,
          dates: 1,
        },
      },
    ]);

    if (!summary.length) {
      return res.status(200).send({
        success: true,
        data: [],
        message: "No data found for the specified date range.",
      });
    }

    res.status(200).send({ success: true, data: summary });
  } catch (err) {
    console.error("Error fetching weather summary by region:", err);
    res.status(500).send({ success: false, message: "Internal server error." });
  }
};
