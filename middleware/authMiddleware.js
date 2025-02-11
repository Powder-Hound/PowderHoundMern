import jwt from "jsonwebtoken";
import { body } from "express-validator";
import { User } from "../models/users.model.js";

const passwordLength = {
  min: 8,
  max: 128,
};

// Token Verification Middleware
export const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;

  // Check for Authorization header with 'Bearer' format
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Malformed or missing token" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET); // No expiration time limit

    // Validate and attach user data to request
    if (!decoded.userID) {
      return res.status(400).json({ message: "Invalid token payload" });
    }

    req.userID = decoded.userID;
    req.permissions = decoded.permissions || []; // Optional, default to an empty array
    next();
  } catch (err) {
    console.error("JWT Error:", err.message);
    const message =
      err.name === "JsonWebTokenError" ? "Invalid token" : "Token error";
    return res.status(403).json({ message });
  }
};

// Signup Validation Middleware
export const signupValidation = [
  body("countryCode")
    .trim()
    .escape()
    .isNumeric()
    .withMessage("Country code must be a number"),

  body("phoneNumber")
    .trim()
    .customSanitizer((value) => value.replace(/[^0-9]/g, "")) // Remove non-numeric characters
    .isMobilePhone("en-US")
    .withMessage("Phone number is not valid")
    .custom(async (value) => {
      const phonenumberInDB = await User.findOne({ phoneNumber: value });
      if (phonenumberInDB) {
        throw new Error("Phone number already exists");
      }
    }),

  body("password")
    .isLength(passwordLength)
    .withMessage(
      `Password must be between ${passwordLength.min} and ${passwordLength.max} characters`
    ),
];
