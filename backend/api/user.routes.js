import express from "express";
import {createUser, login, addLocations, updateAlertThreshold, deleteUser, removeLocations } from "../controllers/user.controller.js";
import { verifyToken, signupValidation } from "../middleware/authMiddleware.js";

const userRouter = express.Router();

userRouter.post("/signup", signupValidation, createUser);

userRouter.get("/login", login);

userRouter.put("/addLocations", verifyToken, addLocations);

userRouter.put("/removeLocations", verifyToken, removeLocations)

userRouter.put("/alertThreshold", verifyToken, updateAlertThreshold);

userRouter.delete("/:id", verifyToken, deleteUser);

export default userRouter;
