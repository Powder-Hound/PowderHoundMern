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
import {
  getBotProtectionConfig,
  otpSendProtection,
  otpValidateProtection,
  otpVerifyProtection,
} from "../middleware/otpBotProtection.js";

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
 * /api/auth/bot-protection:
 *   get:
 *     tags: [Auth]
 *     summary: Public Turnstile widget config for /go OTP
 *     responses:
 *       200:
 *         description: Site key and whether a token is required
 */
authRouter.get("/bot-protection", getBotProtectionConfig);

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
 *         description: Number is usable for Verify (Lookup is advisory)
 *       400:
 *         description: Number is missing or not a plausible US E.164
 *       429:
 *         description: Rate limited per IP or per phone
 */
authRouter.post("/validate-phone", otpValidateProtection, validatePhoneNumber);

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
 *               turnstileToken:
 *                 type: string
 *                 description: Cloudflare Turnstile widget token (required in production)
 *     responses:
 *       200:
 *         description: Code sent successfully
 *       403:
 *         description: Turnstile missing, invalid, or unavailable (fail closed)
 *       429:
 *         description: Rate limited per IP or per phone
 *       500:
 *         description: Failed to send code
 */
authRouter.post("/send-verification-code", otpSendProtection, sendVerificationCode);

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
 *               code:
 *                 type: string
 *               otp:
 *                 type: string
 *     responses:
 *       200:
 *         description: OTP verified successfully
 *       400:
 *         description: Invalid OTP
 *       429:
 *         description: Rate limited per IP or per phone
 */
authRouter.post("/verify-otp", otpVerifyProtection, verifyOTP);

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
