import jwt from "jsonwebtoken";
import { body } from "express-validator";
import { User } from "../models/users.model.js";

// Token Verification Middleware (No Expiration)
export const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Malformed or missing token" });
  }

  const token = authHeader.split(" ")[1];

  try {
    // Verify the token with no expiration check
    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      ignoreExpiration: true, // This bypasses the expiration check
    });

    if (!decoded.userID) {
      return res.status(400).json({ message: "Invalid token payload" });
    }

    req.userID = decoded.userID;
    req.permissions = decoded.permissions || []; // Optional: Defaults to an empty array if not present
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
    .isLength({ min: 8, max: 128 })
    .withMessage("Password must be between 8 and 128 characters"),
];
