import express from "express";
import {
  getAllSkiAreas,
  getSkiAreaById,
  createSkiArea,
  updateSkiArea,
  deleteSkiArea,
} from "../controllers/ski-areas.controller.js";
import { verifyToken } from "../middleware/authMiddleware.js";

const router = express.Router();

// Define dynamic routes for regions
router.get("/:region", verifyToken, getAllSkiAreas);
router.get("/:region/:id", verifyToken, getSkiAreaById);
router.post("/:region", verifyToken, createSkiArea);
router.put("/:region/:id", verifyToken, updateSkiArea);
router.delete("/:region/:id", verifyToken, deleteSkiArea);

export default router;
