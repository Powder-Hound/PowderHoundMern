import express from "express";
import {createUser, login, addLocations, updateAlertThreshold, deleteUser, removeLocations, getUser } from "../controllers/user.controller.js";
import { verifyToken, signupValidation } from "../middleware/authMiddleware.js";
import { verifyUser } from "../middleware/twilioMiddleware.js";

const userRouter = express.Router();

userRouter.post("/signup", signupValidation, verifyUser, createUser);

userRouter.get("/login", login);

userRouter.get("/:id", verifyToken, getUser);

userRouter.put("/addLocations", verifyToken, addLocations);

userRouter.put("/removeLocations", verifyToken, removeLocations)

userRouter.put("/alertThreshold", verifyToken, updateAlertThreshold);

userRouter.delete("/:id", verifyToken, deleteUser);

export default userRouter;
