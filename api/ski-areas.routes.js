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

// Define routes
router.get("/", verifyToken, getAllSkiAreas);
router.get("/:id", verifyToken, getSkiAreaById);
router.post("/", verifyToken, createSkiArea);
router.put("/:id", verifyToken, updateSkiArea);
router.delete("/:id", verifyToken, deleteSkiArea);

export default router;
