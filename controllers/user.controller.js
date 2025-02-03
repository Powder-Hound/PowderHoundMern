import mongoose from "mongoose";
import { User } from "../models/users.model.js";
import argon2 from "argon2";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
dotenv.config();

const hashPassword = async (password) => {
  try {
    const hash = await argon2.hash(password);
    return hash;
  } catch (err) {
    console.error(err);
    throw new Error("Error hashing password");
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
    process.env.JWT_SECRET
  );

  try {
    const savedUser = await newUser.save();
    res.status(201).send({ user: savedUser, token });
  } catch (error) {
    res.status(500).send({
      success: false,
      message: "Error saving user",
      error,
    });
  }
};

export const validateUsername = async (req, res) => {
  const value = req.body.username;
  try {
    const userInDB = await User.findOne({ username: value });
    if (userInDB) {
      return res
        .status(400)
        .send({ success: false, error: "Username already exists" });
    } else {
      return res.status(200).send({ success: true });
    }
  } catch (error) {
    res
      .status(500)
      .send({ success: false, message: "Error validating username" });
  }
};

export const login = async (req, res) => {
  const { phoneNumber, code } = req.body;

  try {
    const userInDB = await User.findOne({ phoneNumber });
    if (!userInDB) {
      return res.status(404).send({
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

    return res.status(201).send({
      token,
      user: userInDB,
    });
  } catch (error) {
    return res.status(500).send({
      success: false,
      message: "Error during login.",
      error: error.message,
    });
  }
};

export const getUser = async (req, res) => {
  const { id } = req.params;

  try {
    if (req.permissions === "admin" || req.userID === id) {
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
    res
      .status(500)
      .send({ success: false, message: "Error fetching user", error });
  }
};

export const updateUser = async (req, res) => {
  const { id } = req.params;
  const updateFields = req.body;

  try {
    if (req.permissions !== "admin" && req.userID !== id) {
      return res
        .status(401)
        .send({ success: false, message: "Unauthorized to update this user" });
    }

    console.log("Incoming update data:", updateFields);

    // 🔹 Convert `resortPreference.resorts` to an array of ObjectIds
    if (
      updateFields.resortPreference &&
      updateFields.resortPreference.resorts
    ) {
      if (!Array.isArray(updateFields.resortPreference.resorts)) {
        return res
          .status(400)
          .send({ success: false, message: "Resorts must be an array" });
      }

      updateFields.resortPreference.resorts =
        updateFields.resortPreference.resorts.map(
          (resortId) => new mongoose.Types.ObjectId(resortId)
        );
    }

    // 🔹 Hash new password if provided
    if (updateFields.password) {
      updateFields.password = await hashPassword(updateFields.password);
    }

    console.log("Processed update fields:", updateFields);

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

    console.log("User updated successfully:", updatedUser);
    res.status(200).send({ success: true, data: updatedUser });
  } catch (error) {
    console.error("Update Error:", error);
    res
      .status(500)
      .send({ success: false, message: "Error updating user", error });
  }
};

export const deleteUser = async (req, res) => {
  const { id } = req.params;

  try {
    if (req.permissions === "admin" || req.userID === id) {
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
    res
      .status(500)
      .send({ success: false, message: "Error deleting user", error });
  }
};
