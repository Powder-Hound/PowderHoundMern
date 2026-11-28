import express from "express";
import mongoose from "mongoose";
import ResortWeatherData from "../models/resortWeatherData.model.js";
import { verifyToken } from "../middleware/authMiddleware.js";
import {
  updateAllVisualCrossingData,
  getAllWeatherData,
  findListOfWeatherData,
  findPublicForecast,
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

/**
 * @swagger
 * /api/visual-crossing/public:
 *   get:
 *     tags: [Weather]
 *     summary: Public forecast rows for PowAlert pilot pages (no auth)
 *     parameters:
 *       - name: ids
 *         in: query
 *         required: true
 *         schema:
 *           type: string
 *         description: Comma-separated resort ObjectIds
 *     responses:
 *       200:
 *         description: Weather rows for the requested ids. Each row includes forecastPoint.elevationFt and forecastPoint.label when the resort has a mid-mountain forecast point. Each forecast day keeps snow and adds snowSources plus blend (median, low, high, sources, n, singleSource). snowSources may include powalert-slr; that source is left out of blend unless BLEND_INCLUDE_POWALERT_SLR is true. US resorts add nwsWindows on days 0-3 (overnight 5 PM-5 AM local, daytime 5 AM-5 PM, and hourly). Canada omits nwsWindows. attribution is an Open-Meteo CC BY 4.0 entry when a day lists an open-meteo source, and an empty array otherwise. /all, /list, /forecast, and /:resortId return the same stored snowSources, blend, nwsWindows, and weatherData.visualCrossing.attribution.
 *       400:
 *         description: Missing or invalid ids
 */
visualCrossingRouter.get(
  "/public",
  validateIds,
  async (req, res, next) => {
    try {
      await findPublicForecast(req, res);
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
