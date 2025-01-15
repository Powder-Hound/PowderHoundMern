import mongoose from "mongoose";
import ResortWeatherData from "../models/resortWeatherData.model.js";
import express from "express";
import { verifyToken } from "../middleware/authMiddleware.js";
import {
  updateAllVisualCrossingData,
  getAllWeatherData,
  findListOfWeatherData,
  // getLast24HoursWeatherData,
  getWeatherAlerts,
  getWeatherSummary,
  getForecastByDate,
} from "../controllers/visualCrossingController.js";
import {
  validateQuery,
  validateIds,
} from "../middleware/validationMiddleware.js";

const visualCrossingRouter = express.Router();

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

// visualCrossingRouter.get(
//   "/last-24-hours",
//   verifyToken,
//   validateQuery(["page", "limit"]),
//   async (req, res, next) => {
//     try {
//       await getLast24HoursWeatherData(req, res);
//     } catch (err) {
//       next(err);
//     }
//   }
// );

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
      return res.status(200).json({
        success: true,
        data: [],
        message: `No weather data found for resortId: ${resortId}.`,
      });
    }

    res.status(200).json({ success: true, data: weatherData });
  } catch (err) {
    console.error("Error fetching weather data by resortId:", err); // Log the full error
    res.status(500).json({ success: false, message: "Internal server error." });
  }
});

export default visualCrossingRouter;
