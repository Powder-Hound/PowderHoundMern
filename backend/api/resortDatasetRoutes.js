import express from "express";
import { verifyToken } from "../middleware/authMiddleware.js";
import { getResortDataset } from "../controllers/resortDatasetController.js";

const resortDatasetRouter = express.Router();

// Protect the dataset endpoint with verifyToken middleware
resortDatasetRouter.get("/dataset", verifyToken, getResortDataset);

export default resortDatasetRouter;
