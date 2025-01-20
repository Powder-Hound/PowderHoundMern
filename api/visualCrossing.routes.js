import mongoose from "mongoose";
import ResortWeatherData from "../models/resortWeatherData.model.js";
import express from "express";
import { verifyToken } from "../middleware/authMiddleware.js";
import {
  updateAllVisualCrossingData,
  getAllWeatherData,
  findListOfWeatherData,
  getWeatherAlerts,
  getWeatherSummary,
  getForecastByDate,
} from "../controllers/visualCrossingController.js";
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

/**
 * @swagger
 * /api/visual-crossing/update-all:
 *   post:
 *     tags: [Weather]
 *     summary: Update all Visual Crossing data
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Data updated successfully
 *       500:
 *         description: Internal server error
 */
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

/**
 * @swagger
 * /api/visual-crossing/all:
 *   get:
 *     tags: [Weather]
 *     summary: Get all weather data
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: page
 *         in: query
 *         required: false
 *         schema:
 *           type: integer
 *         description: Page number for pagination
 *       - name: limit
 *         in: query
 *         required: false
 *         schema:
 *           type: integer
 *         description: Number of items per page
 *       - name: resortName
 *         in: query
 *         required: false
 *         schema:
 *           type: string
 *         description: Name of the resort
 *       - name: startDate
 *         in: query
 *         required: false
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for the data
 *       - name: endDate
 *         in: query
 *         required: false
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for the data
 *     responses:
 *       200:
 *         description: Weather data retrieved successfully
 *       500:
 *         description: Internal server error
 */
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

/**
 * @swagger
 * /api/visual-crossing/list:
 *   get:
 *     tags: [Weather]
 *     summary: Get a list of weather data by IDs
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List retrieved successfully
 *       400:
 *         description: Invalid IDs provided
 */
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
 * /api/visual-crossing/alerts:
 *   get:
 *     tags: [Weather]
 *     summary: Get weather alerts
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: page
 *         in: query
 *         schema:
 *           type: integer
 *         description: Page number for pagination
 *       - name: limit
 *         in: query
 *         schema:
 *           type: integer
 *         description: Number of items per page
 *     responses:
 *       200:
 *         description: Weather alerts retrieved successfully
 *       500:
 *         description: Internal server error
 */
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

/**
 * @swagger
 * /api/visual-crossing/summary:
 *   get:
 *     tags: [Weather]
 *     summary: Get weather summary for a date range
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: startDate
 *         in: query
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for the summary
 *       - name: endDate
 *         in: query
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for the summary
 *     responses:
 *       200:
 *         description: Weather summary retrieved successfully
 *       400:
 *         description: Invalid date range provided
 */
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

/**
 * @swagger
 * /api/visual-crossing/forecast:
 *   get:
 *     tags: [Weather]
 *     summary: Get weather forecast for a specific date
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: date
 *         in: query
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: Date for the forecast
 *     responses:
 *       200:
 *         description: Forecast retrieved successfully
 *       400:
 *         description: Invalid date provided
 */
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

/**
 * @swagger
 * /api/visual-crossing/{resortId}:
 *   get:
 *     tags: [Weather]
 *     summary: Get weather data by resort ID
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: resortId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the resort
 *     responses:
 *       200:
 *         description: Weather data retrieved successfully
 *       400:
 *         description: Invalid resort ID
 *       500:
 *         description: Internal server error
 */
visualCrossingRouter.get("/:resortId", verifyToken, async (req, res, next) => {
  try {
    const { resortId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(resortId)) {
      return res
        .status(400)
        .send({ success: false, message: "Invalid resortId format." });
    }

    const weatherData = await ResortWeatherData.find({ resortId });

    if (!weatherData.length) {
      return res.status(200).send({
        success: true,
        data: [],
        message: `No weather data found for resortId: ${resortId}.`,
      });
    }

    res.status(200).send({ success: true, data: weatherData });
  } catch (err) {
    console.error("Error fetching weather data by resortId:", err); // Log the full error
    res.status(500).send({ success: false, message: "Internal server error." });
  }
});

export default visualCrossingRouter;
