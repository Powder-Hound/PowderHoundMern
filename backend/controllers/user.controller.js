import { User } from "../models/users.model.js";
import argon2 from "argon2";
import jwt from "jsonwebtoken";
import { validationResult } from "express-validator";
import { verifyUser } from "../middleware/twilioMiddleware.js";

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
  const errors = validationResult(req);

  const user = req.body;
  
  if (!errors.isEmpty()) {
    return res.status(422).json({ errors: errors.array() });
  } else {
    const newUser = new User(user);

    // Hash password before database input
    newUser.password = await hashPassword(user.password);
    const token = jwt.sign(
      {
        username: newUser.username,
        userID: newUser._id,
        permissions: newUser.permissions,
      },
      process.env.JWT_SECRET,
      { expiresIn: "1h" },
    );
    try {
      const savedUser = await newUser.save();
      res
        .status(201)
        .json({ success: true, data: savedUser, token: token });
    } catch (error) {
      res
        .status(500)
        .json({ success: false, message: "Error saving user", error: error });
    }
  }
};

export const login = async (req, res) => {
  const { username, password } = req.body;
  try {
    const userInDB = await User.findOne({ username });
    if (userInDB && (await argon2.verify(userInDB.password, password))) {
      const token = jwt.sign(
        {
          username: userInDB.username,
          userID: userInDB._id,
          permissions: userInDB.permissions,
        },
        process.env.JWT_SECRET,
        { expiresIn: "1h" },
      );
      res
        .status(200)
        .json({
          status: 200,
          success: true,
          resortPreference: userInDB.resortPreference,
          token: token
        });
    } else {
      res.status(401).json({ success: false, message: "Invalid credentials", status: 401 });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: "Error retrieving users", status: 500 });
  }
};

export const getUser = async (req, res) => {
  if (req.permissions === "admin" || req.userID === req.params.id) {
    const userInDB = await User.findById(req.params.id);
    if (userInDB) {
      res.status(200).json({ success: true, data: userInDB, status: 200 });
    }
  } else {
    res.status(401).json({ success: false, message: "Unauthorized", status: 401 });
  }
};
// Locations provided will be an ObjectID referring to a resort
export const addLocations = async (req, res) => {
  let prefsAdded = {};

  // This can be refactored more elegantly, but I don't want to use a switch case in the event that data will be skipped over
  if (req.body?.skiPass)  {
    prefsAdded["resortPreference.skiPass"] = req.body.skiPass;
  }
  if (req.body?.resorts) {
    prefsAdded["resortPreference.resorts"] = req.body.resorts;
  }
  try {
    const updatedUser = await User.findByIdAndUpdate(
      req.userID,
      {
        $addToSet: { ...prefsAdded }
      },
      { new: true },
    );
    res.status(200).json({ success: true, data: updatedUser.resortPreference });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Error updating user", error: error });
  }
};

export const removeLocations = async (req, res) => {
  let prefsRemoved = {};
  // Only one can be removed at a time; will be triggered by button on frontend, won't be batch updated like adding
  if (req.body?.skiPass) {
    prefsRemoved["resortPreference.skiPass"] = req.body.skiPass;
  }
  if (req.body.remove?.resorts) {
    prefsRemoved["resortPreference.resorts"] = req.body.resorts;
  }
  try {
    const updatedUser = await User.findByIdAndUpdate(
      req.userID,
      {
        $pull: { ...prefsRemoved }
      },
      { new: true },
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
      { new: true },
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
