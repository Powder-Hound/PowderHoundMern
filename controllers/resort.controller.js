import { Resort } from "../models/resorts.model.js";

export const createResort = async (req, res) => {
  if (req.permissions === "admin") {
    try {
      const resort = new Resort(req.body);
      await resort.save();
      res.status(201).send({ success: true, data: resort });
    } catch (error) {
      res.status(500).send({
        success: false,
        message: "Error creating resort",
        error: error,
      });
    }
  } else {
    res.status(401).send({ success: false, message: "Unauthorized" });
  }
};

export const getResort = async (req, res) => {
  try {
    const resort = await Resort.findById(req.params.id).populate("expediaLink");
    if (resort) {
      res.status(200).send({ success: true, data: resort });
    } else {
      res.status(404).send({ success: false, message: "Resort not found" });
    }
  } catch (error) {
    res.status(500).send({
      success: false,
      message: "Error retrieving resort",
      error: error,
    });
  }
};

export const findResort = async (req, res) => {
  let query = {};
  if (req.query.state) {
    query.State = req.query.state;
  }
  if (req.query.name) {
    query["Ski Resort Name"] = { $regex: req.query.name, $options: "i" };
  }
  if (req.query.id) {
    query._id = req.query.state;
  }
  if (!req.query.name && !req.query.state) {
    try {
      const resort = await Resort.distinct("State");
      if (resort) {
        res.status(200).send({ success: true, data: resort });
      }
    } catch (error) {
      res.status(500).send({
        success: false,
        message: "Error retrieving resort",
        error: error,
      });
    }
  } else {
    try {
      const resort = await Resort.find(query).populate("expediaLink");
      if (resort) {
        res.status(200).send({ success: true, data: resort });
      } else {
        res.status(404).send({ success: false, message: "Resort not found" });
      }
    } catch (error) {
      res.status(500).send({
        success: false,
        message: "Error retrieving resort",
        error: error,
      });
    }
  }
};

export const findListOfResorts = async (req, res) => {
  let ids = req.query.ids;

  if (!ids) {
    return res
      .status(400)
      .send({ success: false, message: "No ids provided in query" });
  }

  // If ids is not already an array, split the comma-separated string
  if (!Array.isArray(ids)) {
    ids = ids.split(",").map((id) => id.trim());
  }

  try {
    const resorts = await Resort.find({ _id: { $in: ids } }).populate(
      "expediaLink"
    );
    res.status(200).send({ success: true, data: resorts });
  } catch (error) {
    res.status(500).send({ success: false, message: error.message || error });
  }
};

export const getAllResorts = async (req, res) => {
  try {
    const resorts = await Resort.find({}).populate("expediaLink");
    return res.status(200).send({
      success: true,
      resorts: {
        data: resorts,
      },
    });
  } catch (error) {
    res.status(500).send({
      success: false,
      message: "Error retrieving resorts",
      error: error,
    });
  }
};

export const updateResort = async (req, res) => {
  if (req.permissions === "admin") {
    try {
      const updatedResort = await Resort.findByIdAndUpdate(
        req.params.id,
        req.body,
        { new: true }
      ).populate("expediaLink");
      if (updatedResort) {
        res.status(200).send({ success: true, data: updatedResort });
      } else {
        res.status(404).send({ success: false, message: "Resort not found" });
      }
    } catch (error) {
      res.status(500).send({
        success: false,
        message: "Error updating resort",
        error: error,
      });
    }
  } else {
    res.status(401).send({ success: false, message: "Unauthorized" });
  }
};

export const deleteResort = async (req, res) => {
  if (req.permissions === "admin") {
    try {
      const deletedResort = await Resort.findByIdAndDelete(req.params.id);
      if (deletedResort) {
        res.status(200).send({ success: true, data: deletedResort });
      } else {
        res.status(404).send({ success: false, message: "Resort not found" });
      }
    } catch (error) {
      res.status(500).send({
        success: false,
        message: "Error deleting resort",
        error: error,
      });
    }
  } else {
    res.status(401).send({ success: false, message: "Unauthorized" });
  }
};
