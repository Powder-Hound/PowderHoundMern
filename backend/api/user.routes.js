import express from "express";
import {
  createUser,
  validateUsername,
  login,
  getUser,
  deleteUser,
  updateAlertThreshold,
} from "../controllers/user.controller.js";
import { verifyToken } from "../middleware/authMiddleware.js";

const userRouter = express.Router();

userRouter.post("/create", createUser);
userRouter.post("/validateUsername", validateUsername);
userRouter.post("/login", login);
userRouter.get("/:id", verifyToken, getUser);
userRouter.put("/alertThreshold", verifyToken, updateAlertThreshold);
userRouter.delete("/:id", verifyToken, deleteUser);

export default userRouter;
