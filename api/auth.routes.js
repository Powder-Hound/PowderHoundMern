import express from "express";
import {
  createUser,
  login,
  validateUsername,
} from "../controllers/user.controller.js";
import {
  sendVerificationCode,
  verifyOTP,
  validatePhoneNumber,
  sendVerificationEmail,
  emailVerificationCheck,
} from "../middleware/twilioMiddleware.js";

const authRouter = express.Router();

// User signup and login
authRouter.post("/signup", createUser);
authRouter.post("/login", login);

// Username and phone validations
authRouter.post("/validate-username", validateUsername);
authRouter.post("/validate-phone", validatePhoneNumber);

// Phone and Email verification
authRouter.post("/send-verification-code", sendVerificationCode);
authRouter.post("/verify-otp", verifyOTP);
authRouter.post("/send-verification-email", sendVerificationEmail);
authRouter.post("/verify-email-otp", emailVerificationCheck);

export default authRouter;
