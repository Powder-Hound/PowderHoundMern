import express from "express";
import {
  getAllExpediaLinks,
  getExpediaLinksByResort,
  addExpediaLinks,
  updateExpediaLinks,
  deleteExpediaLinks,
} from "../controllers/expediaLink.controller.js";
import { verifyToken } from "../middleware/authMiddleware.js";

const expediaLinkRouter = express.Router();

// Get all Expedia links
expediaLinkRouter.get("/", verifyToken, getAllExpediaLinks);

// Get Expedia links for a specific resort
expediaLinkRouter.get("/:resortId", verifyToken, getExpediaLinksByResort);

// Add new Expedia links for a resort
expediaLinkRouter.post("/", verifyToken, addExpediaLinks);

// Update Expedia links for a resort
expediaLinkRouter.put("/:resortId", verifyToken, updateExpediaLinks);

// Delete Expedia links for a resort
expediaLinkRouter.delete("/:resortId", verifyToken, deleteExpediaLinks);

export default expediaLinkRouter;
