import express from "express";
import mongoose from "mongoose";
import ResortWeatherData from "../models/resortWeatherData.model.js";
import { verifyToken } from "../middleware/authMiddleware.js";
import {
  updateAllVisualCrossingData,
  getAllWeatherData,
  findListOfWeatherData,
  getWeatherAlerts,
  getWeatherSummary,
  getForecastByDate,
} from "../controllers/visual-crossing.controller.js";
import {
  validateQuery,
  validateIds,
} from "../middleware/validationMiddleware.js";

const visualCrossingRouter = express.Router();

/**
 * @swagger
 * tags:
 *   name: Weather
 *   description: Weather data management routes
 */

// ✅ Update all weather data
visualCrossingRouter.post(
  "/update-all",
  verifyToken,
  async (req, res, next) => {
    try {
      await updateAllVisualCrossingData(req, res);
    } catch (err) {
      next(err);
    }
  }
);

// ✅ Get all weather data with optional filtering
visualCrossingRouter.get(
  "/all",
  verifyToken,
  validateQuery(["page", "limit", "resortName", "startDate", "endDate"]),
  async (req, res, next) => {
    try {
      await getAllWeatherData(req, res);
    } catch (err) {
      next(err);
    }
  }
);

// ✅ Get weather data by multiple IDs
visualCrossingRouter.get(
  "/list",
  verifyToken,
  validateIds,
  async (req, res, next) => {
    try {
      await findListOfWeatherData(req, res);
    } catch (err) {
      next(err);
    }
  }
);

// ✅ Get weather alerts
visualCrossingRouter.get(
  "/alerts",
  verifyToken,
  validateQuery(["page", "limit"]),
  async (req, res, next) => {
    try {
      await getWeatherAlerts(req, res);
    } catch (err) {
      next(err);
    }
  }
);

// ✅ Get weather summary for a date range
visualCrossingRouter.get(
  "/summary",
  verifyToken,
  validateQuery(["startDate", "endDate"]),
  async (req, res, next) => {
    try {
      await getWeatherSummary(req, res);
    } catch (err) {
      next(err);
    }
  }
);

// ✅ Get weather forecast for a specific date
visualCrossingRouter.get(
  "/forecast",
  verifyToken,
  validateQuery(["date"]),
  async (req, res, next) => {
    try {
      await getForecastByDate(req, res);
    } catch (err) {
      next(err);
    }
  }
);

// ✅ Get weather data by a single resort ID
visualCrossingRouter.get("/:resortId", verifyToken, async (req, res, next) => {
  try {
    const { resortId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(resortId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid resortId format." });
    }

    const weatherData = await ResortWeatherData.find({ resortId });

    if (!weatherData.length) {
      return res
        .status(200)
        .json({
          success: true,
          data: [],
          message: `No weather data found for resortId: ${resortId}.`,
        });
    }

    res.status(200).json({ success: true, data: weatherData });
  } catch (err) {
    console.error("Error fetching weather data by resortId:", err);
    res.status(500).json({ success: false, message: "Internal server error." });
  }
});

export default visualCrossingRouter;
