import express from "express";
import {createUser, login, addResorts, addSkiPasses, updateAlertThreshold, deleteUser, removeResorts, removeSkiPasses, getUser, validateUsername, getUserResorts } from "../controllers/user.controller.js";
import { verifyToken } from "../middleware/authMiddleware.js";
import { sendVerificationCode, verifyOTP, validatePhoneNumber } from "../middleware/twilioMiddleware.js";

const userRouter = express.Router();

userRouter.post("/signup", createUser);

userRouter.post('/validate-username', validateUsername);

userRouter.post('/validate-number', validatePhoneNumber);

userRouter.post('/send-verification', sendVerificationCode);

userRouter.post('/verify-otp', verifyOTP);

userRouter.post("/login", login);

// userRouter.put('/updatePassword', updatePassword);

userRouter.get("/:id", verifyToken, getUser);

userRouter.get('/getUserResorts', verifyToken, getUserResorts);

userRouter.put("/addResorts", verifyToken, addResorts);

userRouter.put("/addSkiPasses", verifyToken, addSkiPasses);

userRouter.put("/removeResorts", verifyToken, removeResorts);

userRouter.put("/removeSkiPasses", verifyToken, removeSkiPasses);

userRouter.put("/alertThreshold", verifyToken, updateAlertThreshold);

userRouter.delete("/:id", verifyToken, deleteUser);

export default userRouter;
