import express from "express";
import { verifyToken } from "../middleware/authMiddleware.js";
import {
  updateAllVisualCrossingData,
  getAllWeatherData,
} from "../controllers/visualCrossingController.js";

const visualCrossingRouter = express.Router();

// Route to update all Visual Crossing data
visualCrossingRouter.post(
  "/weather/update-all",
  verifyToken,
  updateAllVisualCrossingData
);

// Route to get all weather data
visualCrossingRouter.get("/weather/all", verifyToken, getAllWeatherData);

export default visualCrossingRouter;
