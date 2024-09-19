import { User } from "../models/users.model.js";
import argon2 from "argon2";
import jwt from "jsonwebtoken";
import { validationResult } from "express-validator";

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
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({ errors: errors.array() });
  } else {
    const user = req.body;
    delete user.permissions;
    const newUser = new User(user);
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
        .json({ success: true, data: savedUser })
        .cookie("token", token, {
          httpOnly: true,
          sameSite: "none",
          secure: true,
        });
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
          success: true,
          resortPreference: userInDB.resortPreference,
        })
        .cookie("token", token, {
          httpOnly: true,
          sameSite: "none",
          secure: true,
        });
    } else {
      res.status(401).json({ success: false, message: "Invalid credentials" });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: "Error retrieving users" });
  }
};

export const updateResortPreference = async (req, res) => {
  let prefs = {};
  if (req.body.resortPreference.skiPass) {
    prefs["resortPreference.skiPass"] = req.body.resortPreference.skiPass;
  }
  if (req.body.resortPreference.resorts) {
    prefs["resortPreference.resorts"] = req.body.resortPreference.resorts;
  }
  try {
    const updatedUser = await User.findByIdAndUpdate(
      req.userID,
      {
        $addToSet: { ...prefs },
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
