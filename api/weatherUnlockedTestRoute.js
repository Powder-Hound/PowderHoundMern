import express from "express";
import { fetchTestResortData } from "../controllers/weatherUnlockedTestController.js";
import { verifyToken } from "../middleware/authMiddleware.js";

const router = express.Router();

// Secured route to fetch weather data for a specific resort by resortId
router.get("/weather-data", verifyToken, async (req, res) => {
  const resortId = req.query.resortId; // Retrieve resortId from query parameter

  if (!resortId) {
    return res
      .status(400)
      .json({ message: "Missing resortId in query parameters" });
  }

  try {
    const data = await fetchTestResortData(resortId); // Get data from the controller
    res.status(200).json({
      message: "Weather data fetched successfully",
      data, // Return the fetched data
    });
  } catch (error) {
    res.status(500).json({
      message: "Error fetching resort data",
      error: error.message,
    });
  }
});

export default router;
