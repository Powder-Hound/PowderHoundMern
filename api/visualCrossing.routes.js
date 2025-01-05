import express from "express";
import { verifyToken } from "../middleware/authMiddleware.js"; // Import your verifyToken middleware
import {
  updateAllVisualCrossingData,
  getVisualCrossingDataByLocation,
} from "../controllers/visualCrossingController.js";

const router = express.Router();

// Protected route to update all Visual Crossing data
router.post("/weather/update-all", verifyToken, updateAllVisualCrossingData);

// Protected route to fetch Visual Crossing data for a specific location
router.get("/weather/:lat/:long", verifyToken, getVisualCrossingDataByLocation);

export default router;
