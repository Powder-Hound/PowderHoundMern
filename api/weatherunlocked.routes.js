import express from "express";
import { fetchWeatherUnlockedData } from "../controllers/weatherUnlockedController.js";
import { getAllResorts } from "../utils/apiHelper.js";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const query = {
      Country: { $in: ["United States", "Canada", "Europe", "Japan"] },
    };
    const resorts = await getAllResorts(query);
    await fetchWeatherUnlockedData(resorts);
    res
      .status(200)
      .json({ message: "Weather Unlocked data fetched successfully" });
  } catch (error) {
    res
      .status(500)
      .json({
        message: "Error fetching Weather Unlocked data",
        error: error.message,
      });
  }
});

export default router;
