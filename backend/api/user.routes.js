import express from "express";
import {createUser, login, addResorts, addSkiPasses, updateAlertThreshold, deleteUser, removeResorts, removeSkiPasses, getUser } from "../controllers/user.controller.js";
import { verifyToken, signupValidation } from "../middleware/authMiddleware.js";
import { verifyNumber } from "../middleware/twilioMiddleware.js";

const userRouter = express.Router();

userRouter.post("/signup", signupValidation, verifyNumber, createUser);

userRouter.post("/login", login);

userRouter.get("/:id", verifyToken, getUser);

userRouter.put("/addResorts", verifyToken, addResorts);

userRouter.put("/addSkiPasses", verifyToken, addSkiPasses);

userRouter.put("/removeResorts", verifyToken, removeResorts);

userRouter.put("/removeSkiPasses", verifyToken, removeSkiPasses);

userRouter.put("/alertThreshold", verifyToken, updateAlertThreshold);

userRouter.delete("/:id", verifyToken, deleteUser);

export default userRouter;
