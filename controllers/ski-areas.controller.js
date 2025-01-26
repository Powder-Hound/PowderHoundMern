//ski-areas.controller.js
import mongoose from "mongoose";
import { getRegionModel } from "../utils/regionHelper.js";

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
