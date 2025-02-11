import mongoose from "mongoose";
import { User } from "../models/users.model.js";
import argon2 from "argon2";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

const hashPassword = async (password) => {
  if (typeof password !== "string" || password.length < 8) {
    throw new Error("Invalid password format");
  }
  try {
    return await argon2.hash(password);
  } catch (err) {
    console.error("Hashing error:", err);
    throw new Error("Error hashing password");
  }
};

// Create User
export const createUser = async (req, res) => {
  const user = req.body;
  const newUser = new User(user);

  if (newUser.password) {
    newUser.password = await hashPassword(newUser.password);
  }

  const token = jwt.sign(
    {
      username: newUser.username || "User",
      userID: newUser._id,
      permissions: newUser.permissions || [],
    },
    process.env.JWT_SECRET
  );

  try {
    const savedUser = await newUser.save();
    res.status(201).send({ success: true, user: savedUser, token });
  } catch (error) {
    console.error("User creation error:", error);
    res.status(500).send({ success: false, message: "Error saving user" });
  }
};

// Validate Username
export const validateUsername = async (req, res) => {
  const { username } = req.body;

  try {
    const userInDB = await User.findOne({ username });
    if (userInDB) {
      return res
        .status(400)
        .send({ success: false, message: "Username already exists" });
    }
    res.status(200).send({ success: true });
  } catch (error) {
    console.error("Username validation error:", error);
    res
      .status(500)
      .send({ success: false, message: "Error validating username" });
  }
};

// Login
export const login = async (req, res) => {
  const { phoneNumber } = req.body;

  try {
    const userInDB = await User.findOne({ phoneNumber });
    if (!userInDB) {
      return res
        .status(404)
        .send({
          success: false,
          message: "User not found. Please register first.",
        });
    }

    const token = jwt.sign(
      {
        username: userInDB.username,
        userID: userInDB._id,
        permissions: userInDB.permissions,
      },
      process.env.JWT_SECRET
    );

    res.status(201).send({ success: true, token, user: userInDB });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).send({ success: false, message: "Error during login" });
  }
};

// Get User
export const getUser = async (req, res) => {
  const { id } = req.params;

  try {
    if (req.permissions.includes("admin") || req.userID === id) {
      const userInDB = await User.findById(id);
      if (!userInDB) {
        return res
          .status(404)
          .send({ success: false, message: "User not found" });
      }
      res.status(200).send({ success: true, data: userInDB });
    } else {
      res.status(401).send({ success: false, message: "Unauthorized" });
    }
  } catch (error) {
    console.error("Get user error:", error);
    res.status(500).send({ success: false, message: "Error fetching user" });
  }
};

// Update User
export const updateUser = async (req, res) => {
  const { id } = req.params;
  const updateFields = req.body;

  try {
    if (!req.permissions.includes("admin") && req.userID !== id) {
      return res
        .status(401)
        .send({ success: false, message: "Unauthorized to update this user" });
    }

    if (updateFields.password) {
      updateFields.password = await hashPassword(updateFields.password);
    }

    if (updateFields.resortPreference?.resorts) {
      if (!Array.isArray(updateFields.resortPreference.resorts)) {
        return res
          .status(400)
          .send({ success: false, message: "Resorts must be an array" });
      }
      updateFields.resortPreference.resorts =
        updateFields.resortPreference.resorts.map((resortId) =>
          mongoose.Types.ObjectId(resortId)
        );
    }

    const updatedUser = await User.findByIdAndUpdate(
      id,
      { $set: updateFields },
      { new: true, runValidators: true }
    );
    if (!updatedUser) {
      return res
        .status(404)
        .send({ success: false, message: "User not found" });
    }

    res.status(200).send({ success: true, data: updatedUser });
  } catch (error) {
    console.error("Update error:", error);
    res.status(500).send({ success: false, message: "Error updating user" });
  }
};

// Delete User
export const deleteUser = async (req, res) => {
  const { id } = req.params;

  try {
    if (req.permissions.includes("admin") || req.userID === id) {
      const deletedUser = await User.findByIdAndDelete(id);
      if (!deletedUser) {
        return res
          .status(404)
          .send({ success: false, message: "User not found" });
      }
      res.status(200).send({ success: true, data: deletedUser });
    } else {
      res.status(401).send({ success: false, message: "Unauthorized" });
    }
  } catch (error) {
    console.error("Delete user error:", error);
    res.status(500).send({ success: false, message: "Error deleting user" });
  }
};
