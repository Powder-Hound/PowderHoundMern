import express from "express";
import { User } from "../models/users.model.js";
import {createUser, login, updateResortPreference, updateAlertThreshold, deleteUser } from "../controllers/user.controller.js";
import verifyToken from "../middleware/authMiddleware.js";

const userRouter = express.Router();

userRouter.post("/signup", createUser);

userRouter.get("/login", login);

userRouter.put("/preferences/resorts", verifyToken, updateResortPreference);

userRouter.put("/preferences/alertThreshold", verifyToken, updateAlertThreshold);

userRouter.delete("/:id", verifyToken, deleteUser);

export default userRouter;
