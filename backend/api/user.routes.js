import express from "express";
import {
  getUser,
  getUserResorts,
  addResorts,
  addSkiPasses,
  removeResorts,
  removeSkiPasses,
  updateAlertThreshold,
  deleteUser,
} from "../controllers/user.controller.js";
import { verifyToken } from "../middleware/authMiddleware.js";

const userRouter = express.Router();

// Get user data
userRouter.get("/:id", verifyToken, getUser);

// Get user's resort preferences
userRouter.get("/getUserResorts", verifyToken, getUserResorts);

// Update user preferences
userRouter.put("/addResorts", verifyToken, addResorts);
userRouter.put("/addSkiPasses", verifyToken, addSkiPasses);
userRouter.put("/removeResorts", verifyToken, removeResorts);
userRouter.put("/removeSkiPasses", verifyToken, removeSkiPasses);
userRouter.put("/alertThreshold", verifyToken, updateAlertThreshold);

// Delete user
userRouter.delete("/:id", verifyToken, deleteUser);

export default userRouter;
