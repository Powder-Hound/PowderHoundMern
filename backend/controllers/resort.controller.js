import { Resort } from "../models/resorts.model.js";

export const createResort = async (req, res) => {
  if (req.permissions === "admin") {
    try {
      const resort = new Resort(req.body);
      await resort.save();
      res.status(201).json({ success: true, data: resort });
    } catch (error) {
      res
        .status(500)
        .json({
          success: false,
          message: "Error creating resort",
          error: error,
        });
    }
  } else {
    res.status(401).json({ success: false, message: "Unauthorized" });
  }
};

export const getResort = async (req, res) => {
  try {
    const resort = await Resort.findById(req.params.id);
    if (resort) {
      res.status(200).json({ success: true, data: resort });
    } else {
      res.status(404).json({ success: false, message: "Resort not found" });
    }
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Error retrieving resort", error: error });
  }
};

export const getAllResorts = async (req, res) => {
  let page = req.query.page || 1;
  let pageSize = req.query.pageSize || 25;
  try {
    const resorts = await Resort.aggregate([
      {
        $facet: {
          metadata: [{ $count: 'totalCount' }],
          data: [{ $skip: (page - 1) * pageSize }, { $limit: pageSize }],
        },
      },
    ]);
    return res.status(200).json({
      success: true,
      resorts: {
        metadata: { totalCount: resorts[0].metadata[0].totalCount, page, pageSize },
        data: resorts[0].data,
      },
    });
  } catch (error) {
    res
    .status(500) 
    .json({ success: false, message: "Error retrieving resorts", error: error })
  }
};

export const updateResort = async (req, res) => {
  if (req.permissions === "admin") {
    try {
      const updatedResort = await Resort.findByIdAndUpdate(
        req.params.id,
        req.body,
        { new: true },
      );
      if (updatedResort) {
        res.status(200).json({ success: true, data: updatedResort });
      } else {
        res.status(404).json({ success: false, message: "Resort not found" });
      }
    } catch (error) {
      res
        .status(500)
        .json({
          success: false,
          message: "Error updating resort",
          error: error,
        });
    }
  } else {
    res.status(401).json({ success: false, message: "Unauthorized" });
  }
};

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
      res
        .status(500)
        .json({
          success: false,
          message: "Error deleting resort",
          error: error,
        });
    }
  } else {
    res.status(401).json({ success: false, message: "Unauthorized" });
  }
}