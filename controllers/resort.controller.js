import { Resort } from "../models/resorts.model.js";
import { fetchVisualCrossing } from "../externalAPI/visualCrossingAPI.js";

// Helper function to attach weather data dynamically
const attachWeatherData = async (resort) => {
  const { Latitude, Longitude } = resort;

  try {
    const { forecast, uom } = await fetchVisualCrossing(Latitude, Longitude);

    return {
      ...resort.toObject(), // Convert Mongoose document to plain object
      weatherData: {
        forecast,
        uom,
      },
    };
  } catch (error) {
    console.error(`Error fetching weather for resort ${resort._id}:`, error);
    return {
      ...resort.toObject(),
      weatherData: null, // Add null weather data in case of failure
    };
  }
};

// Create Resort
export const createResort = async (req, res) => {
  if (req.permissions === "admin") {
    try {
      const resort = new Resort(req.body);
      await resort.save();
      res.status(201).json({ success: true, data: resort });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error creating resort",
        error: error,
      });
    }
  } else {
    res.status(401).json({ success: false, message: "Unauthorized" });
  }
};

// Get Single Resort with Weather
export const getResort = async (req, res) => {
  try {
    const resort = await Resort.findById(req.params.id);
    if (resort) {
      const resortWithWeather = await attachWeatherData(resort);
      res.status(200).json({ success: true, data: resortWithWeather });
    } else {
      res.status(404).json({ success: false, message: "Resort not found" });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error retrieving resort",
      error: error,
    });
  }
};

// Find Resorts with Weather
export const findResort = async (req, res) => {
  let query = {};
  if (req.query.state) {
    query.State = req.query.state;
  }
  if (req.query.name) {
    query["Ski Resort Name"] = { $regex: req.query.name, $options: "i" };
  }
  if (req.query.id) {
    query._id = req.query.id;
  }

  try {
    const resorts = await Resort.find(query);
    const resortsWithWeather = await Promise.all(
      resorts.map((resort) => attachWeatherData(resort))
    );

    res.status(200).json({ success: true, data: resortsWithWeather });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error retrieving resort",
      error: error,
    });
  }
};

// Get All Resorts with Weather
export const getAllResorts = async (req, res) => {
  try {
    const resorts = await Resort.find({});
    const resortsWithWeather = await Promise.all(
      resorts.map((resort) => attachWeatherData(resort))
    );

    res.status(200).json({
      success: true,
      data: resortsWithWeather,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error retrieving resorts",
      error: error,
    });
  }
};

// Find List of Resorts with Weather
export const findListOfResorts = async (req, res) => {
  let ids = req.query.ids;
  try {
    const resorts = await Resort.find({ _id: { $in: ids } });
    const resortsWithWeather = await Promise.all(
      resorts.map((resort) => attachWeatherData(resort))
    );

    res.status(200).json({ success: true, data: resortsWithWeather });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error retrieving resorts",
      error: error,
    });
  }
};

// Update Resort
export const updateResort = async (req, res) => {
  if (req.permissions === "admin") {
    try {
      const updatedResort = await Resort.findByIdAndUpdate(
        req.params.id,
        req.body,
        { new: true }
      );
      if (updatedResort) {
        res.status(200).json({ success: true, data: updatedResort });
      } else {
        res.status(404).json({ success: false, message: "Resort not found" });
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error updating resort",
        error: error,
      });
    }
  } else {
    res.status(401).json({ success: false, message: "Unauthorized" });
  }
};

// Delete Resort
export const deleteResort = async (req, res) => {
  if (req.permissions === "admin") {
    try {
      const deletedResort = await Resort.findByIdAndDelete(req.params.id);
      if (deletedResort) {
        res.status(200).json({ success: true, data: deletedResort });
      } else {
        res.status(404).json({ success: false, message: "Resort not found" });
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error deleting resort",
        error: error,
      });
    }
  } else {
    res.status(401).json({ success: false, message: "Unauthorized" });
  }
};
