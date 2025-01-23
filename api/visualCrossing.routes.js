import express from "express";
import { verifyToken } from "../middleware/authMiddleware.js";
import {
  updateAllVisualCrossingDataByRegion,
  getAllWeatherDataByRegion,
  findListOfWeatherDataByRegion,
  getWeatherAlertsByRegion,
  getWeatherSummaryByRegion,
  getForecastByDateAndRegion,
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
 *   description: Weather data management routes for specific regions
 */

/**
 * @swagger
 * /api/visual-crossing/{region}/update-all:
 *   post:
 *     tags: [Weather]
 *     summary: Update all Visual Crossing data for a specific region
 *     parameters:
 *       - name: region
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           enum: [us, europe, japan]
 *         description: The region to update weather data for
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Data updated successfully
 *       500:
 *         description: Internal server error
 */
visualCrossingRouter.post(
  "/:region/update-all",
  verifyToken,
  async (req, res, next) => {
    try {
      await updateAllVisualCrossingDataByRegion(req, res);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * @swagger
 * /api/visual-crossing/{region}/all:
 *   get:
 *     tags: [Weather]
 *     summary: Get all weather data for a specific region
 *     parameters:
 *       - name: region
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           enum: [us, europe, japan]
 *         description: The region to fetch weather data for
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
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Weather data retrieved successfully
 *       500:
 *         description: Internal server error
 */
visualCrossingRouter.get(
  "/:region/all",
  verifyToken,
  validateQuery(["resortName", "startDate", "endDate"]),
  async (req, res, next) => {
    try {
      await getAllWeatherDataByRegion(req, res);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * @swagger
 * /api/visual-crossing/{region}/list:
 *   get:
 *     tags: [Weather]
 *     summary: Get a list of weather data by IDs for a specific region
 *     parameters:
 *       - name: region
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           enum: [us, europe, japan]
 *         description: The region to fetch weather data for
 *       - name: ids
 *         in: query
 *         required: true
 *         schema:
 *           type: string
 *         description: Comma-separated list of IDs
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List retrieved successfully
 *       400:
 *         description: Invalid IDs provided
 */
visualCrossingRouter.get(
  "/:region/list",
  verifyToken,
  validateIds,
  async (req, res, next) => {
    try {
      await findListOfWeatherDataByRegion(req, res);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * @swagger
 * /api/visual-crossing/{region}/alerts:
 *   get:
 *     tags: [Weather]
 *     summary: Get weather alerts for a specific region
 *     parameters:
 *       - name: region
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           enum: [us, europe, japan]
 *         description: The region to fetch weather alerts for
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Weather alerts retrieved successfully
 *       500:
 *         description: Internal server error
 */
visualCrossingRouter.get(
  "/:region/alerts",
  verifyToken,
  async (req, res, next) => {
    try {
      await getWeatherAlertsByRegion(req, res);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * @swagger
 * /api/visual-crossing/{region}/summary:
 *   get:
 *     tags: [Weather]
 *     summary: Get weather summary for a date range in a specific region
 *     parameters:
 *       - name: region
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           enum: [us, europe, japan]
 *         description: The region to fetch the summary for
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
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Weather summary retrieved successfully
 *       400:
 *         description: Invalid date range provided
 */
visualCrossingRouter.get(
  "/:region/summary",
  verifyToken,
  validateQuery(["startDate", "endDate"]),
  async (req, res, next) => {
    try {
      await getWeatherSummaryByRegion(req, res);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * @swagger
 * /api/visual-crossing/{region}/forecast:
 *   get:
 *     tags: [Weather]
 *     summary: Get weather forecast for a specific date in a region
 *     parameters:
 *       - name: region
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           enum: [us, europe, japan]
 *         description: The region to fetch the forecast for
 *       - name: date
 *         in: query
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: Date for the forecast
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Forecast retrieved successfully
 *       400:
 *         description: Invalid date provided
 */
visualCrossingRouter.get(
  "/:region/forecast",
  verifyToken,
  validateQuery(["date"]),
  async (req, res, next) => {
    try {
      await getForecastByDateAndRegion(req, res);
    } catch (err) {
      next(err);
    }
  }
);

export default visualCrossingRouter;
