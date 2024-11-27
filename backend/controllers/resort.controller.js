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

export const findResort = async (req, res) => {
  let query = {}
  if (req.query.state) {
    query.State = req.query.state
  }
  if (req.query.name) {
    query['Ski Resort Name'] = { '$regex': req.query.name, '$options': 'i' }
  }
  if (req.query.id) {
    query._id = req.query.state
  }
  if (!req.query.name && !req.query.state) {
    try {
      const resort = await Resort.distinct('State')
      if (resort) {
        res.status(200).json({ success: true, data: resort });
      }
    } catch (error) {
      res
        .status(500)
        .json({ success: false, message: "Error retrieving resort", error: error });
    }
  } else {
    try {
      const resort = await Resort.find(query);
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
  }
};

export const findListOfResorts = async (req, res) => {
  // expects list of IDs from front end/user object
  let ids = req.query.ids;
  try {
    const resorts = await Resort.find({'_id': { $in: ids}})
    if (resorts) {
      res.status(200).json({success: true, data: resorts})
    } else {
      res.status(500).json({success: false, message: 'There was an error retrieving resorts'})
    }
  } catch (error) {
    res.status(500).json({success: false, message: error})
  }
} 

export const getAllResorts = async (req, res) => {
  let page = Number(req.query.page) || 1;
  let pageSize = Number(req.query.pageSize) || 25;
  try {
    const resorts = await Resort.aggregate([
      {
        $facet: {
          metadata: [{ $count: 'totalCount' }],
          data: [{ $skip: (page - 1) * pageSize }, { $limit: pageSize + 1 }],
        },
      },
    ]);

    let hasNextPage = false
    if (resorts[0].data.length > pageSize) {
      hasNextPage = true; // has a next page of results
      resorts[0].data.pop(); // remove extra result
    }
    return res.status(200).json({
      success: true,
      resorts: {
        metadata: { totalCount: resorts[0].metadata[0].totalCount, page, pageSize, hasNextPage },
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