//ski-areas.controller.js
import mongoose from "mongoose";
import { getRegionModel } from "../utils/regionHelper.js";
import { getResortWeatherDataModel } from "../models/resortWeatherData.model.js";

// // Dynamically get the appropriate collection
// const getRegionModel = (region) => {
//   const collectionName = {
//     us: "ski_us",
//     europe: "ski_europe",
//     japan: "ski_japan",
//   }[region];

//   if (!collectionName) throw new Error("Invalid region specified");

//   return mongoose.model(
//     region,
//     new mongoose.Schema({}, { strict: false }),
//     collectionName
//   );
// };

// Get all ski areas for a region
export const getAllSkiAreas = async (req, res) => {
  try {
    const { region } = req.params; // Extract the region from the route
    const Model = getRegionModel(region); // Use the updated helper function
    const skiAreas = await Model.find(); // Query the correct collection
    res.status(200).send(skiAreas);
  } catch (err) {
    console.error(err);
    res.status(500).send({ message: err.message });
  }
};

// Get a single ski area by ID for a region
export const getSkiAreaById = async (req, res) => {
  try {
    const { region, id } = req.params; // Extract region and ID from route
    const Model = getRegionModel(region);

    const skiArea = await Model.findById(id);
    if (!skiArea)
      return res.status(404).send({ message: "Ski area not found" });

    res.send(skiArea);
  } catch (err) {
    res.status(500).send({ message: err.message });
  }
};

// Create a new ski area for a region
export const createSkiArea = async (req, res) => {
  try {
    const { region } = req.params; // Extract the region from the route
    const Model = getRegionModel(region);

    const newSkiArea = new Model(req.body);
    const savedSkiArea = await newSkiArea.save();

    res.status(201).send(savedSkiArea);
  } catch (err) {
    res.status(400).send({ message: err.message });
  }
};

// Update a ski area by ID for a region
export const updateSkiArea = async (req, res) => {
  try {
    const { region, id } = req.params; // Extract region and ID from route
    const Model = getRegionModel(region);

    const updatedSkiArea = await Model.findByIdAndUpdate(id, req.body, {
      new: true,
    });
    if (!updatedSkiArea)
      return res.status(404).send({ message: "Ski area not found" });

    res.send(updatedSkiArea);
  } catch (err) {
    res.status(400).send({ message: err.message });
  }
};

// Delete a ski area by ID for a region
export const deleteSkiArea = async (req, res) => {
  try {
    const { region, id } = req.params; // Extract region and ID from route
    const Model = getRegionModel(region);

    const deletedSkiArea = await Model.findByIdAndDelete(id);
    if (!deletedSkiArea)
      return res.status(404).send({ message: "Ski area not found" });

    res.send({ message: "Ski area deleted" });
  } catch (err) {
    res.status(500).send({ message: err.message });
  }
};

export const findListOfSkiAreas = async (req, res) => {
  try {
    const { region } = req.params; // Extract region
    let { ids } = req.query; // Comma-separated list of IDs

    if (!ids) {
      return res.status(400).send({
        success: false,
        message: "No IDs provided.",
      });
    }

    // Parse and validate IDs
    ids = ids.split(",").map((id) => id.trim());
    const objectIds = ids.map((id) => {
      if (!mongoose.Types.ObjectId.isValid(id)) {
        throw new Error(`Invalid ID format: ${id}`);
      }
      return new mongoose.Types.ObjectId(id);
    });

    // Get the model for the specified region
    const RegionModel = getRegionModel(region);

    // Fetch ski areas from the database
    const skiAreas = await RegionModel.find({ _id: { $in: objectIds } });

    if (!skiAreas.length) {
      return res.status(404).send({
        success: false,
        message: "No ski areas found for the provided IDs.",
      });
    }

    res.status(200).send({
      success: true,
      data: skiAreas,
    });
  } catch (err) {
    console.error("Error fetching ski areas:", err.message);
    res.status(500).send({
      success: false,
      message: err.message || "Internal server error",
    });
  }
};
