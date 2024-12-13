import { User } from "../models/users.model.js";
import argon2 from "argon2";
import jwt from "jsonwebtoken";
// import { validationResult } from "express-validator";
import twilio from "twilio";
import dotenv from "dotenv";
dotenv.config();

console.log("TWILIO_ACCOUNT_SID:", process.env.TWILIO_ACCOUNT_SID);
console.log("TWILIO_AUTH_TOKEN:", process.env.TWILIO_AUTH_TOKEN);
console.log(
  "TWILIO_VERIFY_SERVICE_SID:",
  process.env.TWILIO_VERIFY_SERVICE_SID
);
const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const hashPassword = async (password) => {
  try {
    const hash = await argon2.hash(password);
    return hash;
  } catch (err) {
    console.error(err);
  }
};

// Username, password, and phone number are required
// Email is optional
// Username and Phonenumber must be unique
// Password must be between 8 and 128 characters long
export const createUser = async (req, res) => {
  // Validate the request body- called in index.js in the route declaration. Defined in ../middleware/authMiddleware.js
  // const errors = validationResult(req);

  const user = req.body;

  // if (!errors.isEmpty()) {
  //   return res.status(422).json({ errors: errors.array() });
  // } else {
  const newUser = new User(user);

  // Hash password before database input
  if (newUser.password) {
    newUser.password = await hashPassword(user.password);
  }
  const token = jwt.sign(
    {
      username: newUser.name,
      userID: newUser._id,
      permissions: newUser.permissions,
    },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );
  try {
    const savedUser = await newUser.save();
    res.status(201).json({ success: true, data: savedUser, token: token });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Error saving user", error: error });
  }
  // }
};

export const validateUsername = async (req, res) => {
  const value = req.body.username;
  const userInDB = await User.findOne({ username: value });
  if (userInDB) {
    console.log(userInDB);
    return res
      .status(400)
      .json({ success: false, error: "Username already exists" });
  } else {
    return res.status(200).json({ success: true });
  }
};

const validateAndFormatPhoneNumber = async (phoneNumber) => {
  try {
    // Check for valid E.164 format
    const phoneRegex = /^\+\d{10,15}$/;
    if (!phoneRegex.test(phoneNumber)) {
      throw new Error("Phone number must be in valid E.164 format.");
    }

    // Validate the phone number with Twilio's Lookup API
    const lookup = await client.lookups.v2.phoneNumbers(phoneNumber).fetch();
    console.log("Validated Phone Number:", lookup.phoneNumber);
    return lookup.phoneNumber;
  } catch (error) {
    console.error("Phone Number Validation Error:", error.message);
    throw new Error(
      "Invalid or unsupported phone number. Ensure the number is in E.164 format."
    );
  }
};

// Function to generate JWT Token
const generateToken = (user) => {
  return jwt.sign(
    {
      username: user.name,
      userID: user._id,
      permissions: user.permissions,
    },
    process.env.JWT_SECRET || "default_secret",
    { expiresIn: "1h" }
  );
};

export const login = async (req, res) => {
  const { phoneNumber, code } = req.body;

  try {
    console.log("Request Body:", req.body);

    // Step 1: Validate and format the phone number (E.164 format)
    const formattedPhoneNumber = phoneNumber.startsWith("+")
      ? phoneNumber
      : `+${phoneNumber}`;
    console.log("Formatted Phone Number:", formattedPhoneNumber);

    // Step 2: Verify OTP with Twilio
    const verificationCheck = await client.verify.v2
      .services(process.env.TWILIO_VERIFY_SERVICE_SID)
      .verificationChecks.create({
        to: formattedPhoneNumber,
        code: code,
      });

    console.log("Verification Status:", verificationCheck.status);

    if (verificationCheck.status !== "approved") {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired verification code.",
      });
    }

    // Step 3: Find user in the database
    const userInDB = await User.findOne({ phoneNumber: formattedPhoneNumber });
    if (!userInDB) {
      return res.status(404).json({
        success: false,
        message: "User not found. Please register first.",
      });
    }

    // Step 4: Generate JWT token
    const token = jwt.sign(
      {
        username: userInDB.name,
        userID: userInDB._id,
        permissions: userInDB.permissions,
      },
      process.env.JWT_SECRET || "default_secret",
      { expiresIn: "1h" }
    );

    // Step 5: Return success response
    return res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      user: {
        id: userInDB._id,
        phoneNumber: userInDB.phoneNumber,
        username: userInDB.name,
        permissions: userInDB.permissions,
      },
    });
  } catch (error) {
    console.error("Login Error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Error during login.",
      error: error.message,
    });
  }
};

export const getUser = async (req, res) => {
  if (req.permissions === "admin" || req.userID === req.params.id) {
    const userInDB = await User.findById(req.params.id);
    if (userInDB) {
      res.status(200).json({ success: true, data: userInDB, status: 200 });
    }
  } else {
    res
      .status(401)
      .json({ success: false, message: "Unauthorized", status: 401 });
  }
};

export const getUserResorts = async (req, res) => {
  if (req.permissions === "admin" || req.userID === req.params.id) {
    const userInDB = await User.findById(req.params.id);
    if (userInDB) {
      res.status(200).json({
        success: true,
        data: userInDB.resortPreference?.resorts,
        status: 200,
      });
    }
  } else {
    res
      .status(401)
      .json({ success: false, message: "Unauthorized", status: 401 });
  }
};

// Locations provided will be an ObjectID referring to a resort
export const addResorts = async (req, res) => {
  let prefsAdded = {};

  if (req.body?.resorts) {
    prefsAdded["resortPreference.resorts"] = req.body.resorts;
  }

  try {
    const updatedUser = await User.findByIdAndUpdate(
      req.userID,
      {
        $addToSet: { ...prefsAdded },
      },
      { new: true }
    );
    res.status(200).json({ success: true, data: updatedUser.resortPreference });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Error updating user", error: error });
  }
};

export const addSkiPasses = async (req, res) => {
  let prefsAdded = {};

  if (req.body?.skiPass) {
    prefsAdded["resortPreference.skiPass"] = req.body.skiPass;
  }

  try {
    const updatedUser = await User.findByIdAndUpdate(
      req.userID,
      {
        $addToSet: { ...prefsAdded },
      },
      { new: true }
    );
    res.status(200).json({ success: true, data: updatedUser.resortPreference });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Error updating user", error: error });
  }
};

export const removeResorts = async (req, res) => {
  let prefsRemoved = [];
  if (req.body?.resorts) {
    prefsRemoved = req.body.resorts;
  }
  try {
    const updatedUser = await User.findByIdAndUpdate(
      req.userID,
      {
        $pull: { "resortPreference.resorts": { $in: prefsRemoved } },
      },
      { new: true }
    );
    res.status(200).json({ success: true, data: updatedUser.resortPreference });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Error updating user", error: error });
  }
};

export const removeSkiPasses = async (req, res) => {
  let prefsRemoved = [];
  if (req.body?.skiPass) {
    prefsRemoved = req.body.skiPass;
  }
  try {
    const updatedUser = await User.findByIdAndUpdate(
      req.userID,
      {
        $pull: { "resortPreference.skiPass": { $in: prefsRemoved } },
      },
      { new: true }
    );
    res.status(200).json({ success: true, data: updatedUser.resortPreference });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Error updating user", error: error });
  }
};

export const updateAlertThreshold = async (req, res) => {
  let prefs = {};
  if (req.body.alertThreshold.preferredResorts) {
    prefs["alertThreshold.preferredResorts"] =
      req.body.alertThreshold.preferredResorts;
  }
  if (req.body.alertThreshold.anyResort) {
    prefs["alertThreshold.anyResort"] = req.body.alertThreshold.anyResort;
  }
  try {
    const updatedUser = await User.findByIdAndUpdate(
      req.userID,
      { $set: { ...prefs } },
      { new: true }
    );
    res.status(200).json({ success: true, data: updatedUser.alertThreshold });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Error updating user", error: error });
  }
};

export const deleteUser = async (req, res) => {
  try {
    if (req.privileges === "admin" || req.userID === req.params.id) {
      const deletedUser = await User.findByIdAndDelete(req.userID);
      res.status(200).json({ success: true, data: deletedUser });
    } else {
      res.status(401).json({ success: false, message: "Unauthorized" });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: "Error deleting user" });
  }
};
