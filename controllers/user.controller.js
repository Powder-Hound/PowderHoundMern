import { User } from "../models/users.model.js";
import argon2 from "argon2";
import jwt from "jsonwebtoken";
import twilio from "twilio";
import dotenv from "dotenv";
dotenv.config();

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

export const createUser = async (req, res) => {
  const user = req.body;
  const newUser = new User(user);

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
    res.status(201).json({ success: true, user: savedUser, token: token });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Error saving user", error: error });
  }
};

export const validateUsername = async (req, res) => {
  const value = req.body.username;
  const userInDB = await User.findOne({ username: value });
  if (userInDB) {
    return res
      .status(400)
      .json({ success: false, error: "Username already exists" });
  } else {
    return res.status(200).json({ success: true });
  }
};

export const login = async (req, res) => {
  const { phoneNumber, code } = req.body;

  try {
    const userInDB = await User.findOne({ phoneNumber: phoneNumber });
    if (!userInDB) {
      return res.status(404).json({
        success: false,
        message: "User not found. Please register first.",
      });
    }

    const token = jwt.sign(
      {
        username: userInDB.name,
        userID: userInDB._id,
        permissions: userInDB.permissions,
      },
      process.env.JWT_SECRET || "default_secret",
      { expiresIn: "1h" }
    );

    return res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      user: userInDB,
    });
  } catch (error) {
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
