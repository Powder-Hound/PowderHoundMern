import express from "express";
import { verifyToken } from "../middleware/authMiddleware.js";
import {
  updateAllVisualCrossingData,
  getAllWeatherData,
  findListOfWeatherData,
} from "../controllers/visualCrossingController.js";

const visualCrossingRouter = express.Router();

// Route to trigger the update of Visual Crossing weather data for all resorts
visualCrossingRouter.post("/update-all", verifyToken, async (req, res) => {
  try {
    console.log("Triggering Visual Crossing data update...");
    await updateAllVisualCrossingData(req, res);
  } catch (err) {
    console.error("Error triggering Visual Crossing data update:", err);
    res.status(500).send({ message: "Error updating Visual Crossing data" });
  }
});

// Route to fetch all stored weather data
visualCrossingRouter.get("/all", verifyToken, async (req, res) => {
  try {
    console.log("Fetching all Visual Crossing weather data...");
    await getAllWeatherData(req, res);
  } catch (err) {
    console.error("Error fetching weather data:", err);
    res.status(500).send({ message: "Error fetching weather data" });
  }
});

// Route to fetch weather data for a list of ResortIDs
visualCrossingRouter.get("/list", verifyToken, async (req, res) => {
  try {
    console.log("Fetching weather data for a list of resorts...");
    await findListOfWeatherData(req, res);
  } catch (err) {
    console.error("Error fetching weather data for list:", err);
    res.status(500).send({ message: "Error fetching weather data for list" });
  }
});

export default visualCrossingRouter;
