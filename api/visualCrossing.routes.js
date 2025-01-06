import express from "express";
import { verifyToken } from "../middleware/authMiddleware.js";
import {
  updateAllVisualCrossingData,
  getAllWeatherData,
} from "../controllers/visualCrossingController.js";

const router = express.Router();

// Route to update all Visual Crossing data
router.post("/weather/update-all", verifyToken, updateAllVisualCrossingData);

// Route to get all weather data
router.get("/weather/all", verifyToken, getAllWeatherData);

export default router;
