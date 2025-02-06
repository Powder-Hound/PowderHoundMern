import { ExpediaLink } from "../models/expediaLink.model.js";

// Get all Expedia links
export const getAllExpediaLinks = async (req, res) => {
  try {
    const expediaLinks = await ExpediaLink.find().populate(
      "resortId",
      "resortName"
    );
    res.status(200).send(expediaLinks);
  } catch (error) {
    res.status(500).send({ message: "Server error", error: error.message });
  }
};

// Get Expedia links for a specific resort
export const getExpediaLinksByResort = async (req, res) => {
  try {
    const { resortId } = req.params;
    const expediaLink = await ExpediaLink.findOne({ resortId }).populate(
      "resortId",
      "resortName"
    );

    if (!expediaLink) {
      return res
        .status(404)
        .send({ message: "No Expedia links found for this resort" });
    }

    res.status(200).send(expediaLink);
  } catch (error) {
    res.status(500).send({ message: "Server error", error: error.message });
  }
};

// Add new Expedia links for a resort
export const addExpediaLinks = async (req, res) => {
  try {
    const { resortId, links } = req.body;

    if (!resortId || !links || !Array.isArray(links)) {
      return res.status(400).send({ message: "Invalid data format" });
    }

    const newExpediaLink = new ExpediaLink({ resortId, links });
    await newExpediaLink.save();

    res.status(201).send({
      message: "Expedia links added successfully",
      expediaLink: newExpediaLink,
    });
  } catch (error) {
    res.status(500).send({ message: "Server error", error: error.message });
  }
};

// Update Expedia links for a resort
export const updateExpediaLinks = async (req, res) => {
  try {
    const { resortId } = req.params;
    const { links } = req.body;

    if (!Array.isArray(links)) {
      return res.status(400).send({ message: "Links should be an array" });
    }

    const updatedExpediaLink = await ExpediaLink.findOneAndUpdate(
      { resortId },
      { links },
      { new: true, upsert: true } // Create if doesn't exist
    );

    res.status(200).send({
      message: "Expedia links updated successfully",
      expediaLink: updatedExpediaLink,
    });
  } catch (error) {
    res.status(500).send({ message: "Server error", error: error.message });
  }
};

// Delete Expedia links for a resort
export const deleteExpediaLinks = async (req, res) => {
  try {
    const { resortId } = req.params;

    const deletedExpediaLink = await ExpediaLink.findOneAndDelete({ resortId });

    if (!deletedExpediaLink) {
      return res
        .status(404)
        .send({ message: "No Expedia links found to delete" });
    }

    res.status(200).send({ message: "Expedia links deleted successfully" });
  } catch (error) {
    res.status(500).send({ message: "Server error", error: error.message });
  }
};
