const Feature = require("../models/Feature");

// Get all ski areas
exports.getAllSkiAreas = async (req, res) => {
  try {
    const skiAreas = await Feature.find();
    res.json(skiAreas);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Get a single ski area by ID
exports.getSkiAreaById = async (req, res) => {
  try {
    const skiArea = await Feature.findById(req.params.id);
    if (!skiArea)
      return res.status(404).json({ message: "Ski area not found" });
    res.json(skiArea);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Create a new ski area
exports.createSkiArea = async (req, res) => {
  try {
    const newSkiArea = new Feature(req.body);
    const savedSkiArea = await newSkiArea.save();
    res.status(201).json(savedSkiArea);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// Update a ski area
exports.updateSkiArea = async (req, res) => {
  try {
    const updatedSkiArea = await Feature.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    if (!updatedSkiArea)
      return res.status(404).json({ message: "Ski area not found" });
    res.json(updatedSkiArea);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// Delete a ski area
exports.deleteSkiArea = async (req, res) => {
  try {
    const deletedSkiArea = await Feature.findByIdAndDelete(req.params.id);
    if (!deletedSkiArea)
      return res.status(404).json({ message: "Ski area not found" });
    res.json({ message: "Ski area deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
