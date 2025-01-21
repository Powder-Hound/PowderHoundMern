import { Feature } from "../models/Feature.js";

// Get all ski areas
export const getAllSkiAreas = async (req, res) => {
  try {
    const skiAreas = await Feature.find();
    res.send(skiAreas);
  } catch (err) {
    res.status(500).send({ message: err.message });
  }
};

// Get a single ski area by ID
export const getSkiAreaById = async (req, res) => {
  try {
    const skiArea = await Feature.findById(req.params.id);
    if (!skiArea)
      return res.status(404).send({ message: "Ski area not found" });
    res.send(skiArea);
  } catch (err) {
    res.status(500).send({ message: err.message });
  }
};

// Create a new ski area
export const createSkiArea = async (req, res) => {
  try {
    const newSkiArea = new Feature(req.body);
    const savedSkiArea = await newSkiArea.save();
    res.status(201).send(savedSkiArea);
  } catch (err) {
    res.status(400).send({ message: err.message });
  }
};

// Update a ski area
export const updateSkiArea = async (req, res) => {
  try {
    const updatedSkiArea = await Feature.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    if (!updatedSkiArea)
      return res.status(404).send({ message: "Ski area not found" });
    res.send(updatedSkiArea);
  } catch (err) {
    res.status(400).send({ message: err.message });
  }
};

// Delete a ski area
export const deleteSkiArea = async (req, res) => {
  try {
    const deletedSkiArea = await Feature.findByIdAndDelete(req.params.id);
    if (!deletedSkiArea)
      return res.status(404).send({ message: "Ski area not found" });
    res.send({ message: "Ski area deleted" });
  } catch (err) {
    res.status(500).send({ message: err.message });
  }
};
