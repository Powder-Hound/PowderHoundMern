import express from "express";
import {
  getUser,
  deleteUser,
  updateUser,
} from "../controllers/user.controller.js";
import { verifyToken } from "../middleware/authMiddleware.js";

const userRouter = express.Router();

// User management routes
userRouter.get("/:id", verifyToken, getUser);
userRouter.put("/:id", verifyToken, updateUser);
userRouter.delete("/:id", verifyToken, deleteUser);

export default userRouter;
