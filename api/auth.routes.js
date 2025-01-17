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

/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: User authentication and validation
 */

/**
 * @swagger
 * /api/auth/signup:
 *   post:
 *     tags: [Auth]
 *     summary: Create a new user
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username:
 *                 type: string
 *               password:
 *                 type: string
 *               email:
 *                 type: string
 *     responses:
 *       201:
 *         description: User created successfully
 *       400:
 *         description: Invalid data
 */
authRouter.post("/signup", createUser);

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Log in a user
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful
 *       401:
 *         description: Unauthorized
 */
authRouter.post("/login", login);

/**
 * @swagger
 * /api/auth/validate-username:
 *   post:
 *     tags: [Auth]
 *     summary: Validate a username
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username:
 *                 type: string
 *     responses:
 *       200:
 *         description: Username is valid
 *       400:
 *         description: Invalid username
 */
authRouter.post("/validate-username", validateUsername);

/**
 * @swagger
 * /api/auth/validate-phone:
 *   post:
 *     tags: [Auth]
 *     summary: Validate a phone number
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               phoneNumber:
 *                 type: string
 *     responses:
 *       200:
 *         description: Phone number is valid
 *       400:
 *         description: Invalid phone number
 */
authRouter.post("/validate-phone", validatePhoneNumber);

/**
 * @swagger
 * /api/auth/send-verification-code:
 *   post:
 *     tags: [Auth]
 *     summary: Send a phone verification code
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               phoneNumber:
 *                 type: string
 *     responses:
 *       200:
 *         description: Code sent successfully
 *       500:
 *         description: Failed to send code
 */
authRouter.post("/send-verification-code", sendVerificationCode);

/**
 * @swagger
 * /api/auth/verify-otp:
 *   post:
 *     tags: [Auth]
 *     summary: Verify phone OTP
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               phoneNumber:
 *                 type: string
 *               otp:
 *                 type: string
 *     responses:
 *       200:
 *         description: OTP verified successfully
 *       400:
 *         description: Invalid OTP
 */
authRouter.post("/verify-otp", verifyOTP);

/**
 * @swagger
 * /api/auth/send-verification-email:
 *   post:
 *     tags: [Auth]
 *     summary: Send an email verification code
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *     responses:
 *       200:
 *         description: Code sent successfully
 *       500:
 *         description: Failed to send code
 */
authRouter.post("/send-verification-email", sendVerificationEmail);

/**
 * @swagger
 * /api/auth/verify-email-otp:
 *   post:
 *     tags: [Auth]
 *     summary: Verify email OTP
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *               otp:
 *                 type: string
 *     responses:
 *       200:
 *         description: OTP verified successfully
 *       400:
 *         description: Invalid OTP
 */
authRouter.post("/verify-email-otp", emailVerificationCheck);

export default authRouter;
