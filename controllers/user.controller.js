import { User } from "../models/users.model.js";
import argon2 from "argon2";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

const hashPassword = async (password) => {
  try {
    return await argon2.hash(password);
  } catch (err) {
    console.error(err);
    throw new Error("Error hashing password");
  }
};

export const createUser = async (req, res) => {
  try {
    const user = req.body;

    if (user.password) {
      user.password = await hashPassword(user.password);
    }

    const newUser = new User(user);
    const savedUser = await newUser.save();

    const token = jwt.sign(
      {
        username: savedUser.name,
        userID: savedUser._id,
        permissions: savedUser.permissions,
      },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    res.status(201).json({ success: true, user: savedUser, token });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Error saving user", error });
  }
};

export const validateUsername = async (req, res) => {
  const value = req.body.name;
  try {
    const userInDB = await User.findOne({ name: value });
    if (userInDB) {
      return res
        .status(400)
        .json({ success: false, error: "Username already exists" });
    }
    res.status(200).json({ success: true });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Error validating username", error });
  }
};

export const login = async (req, res) => {
  const { phoneNumber } = req.body;

  try {
    const userInDB = await User.findOne({ phoneNumber });
    if (!userInDB) {
      return res
        .status(404)
        .json({
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

    res
      .status(200)
      .json({
        success: true,
        message: "Login successful",
        token,
        user: userInDB,
      });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Error during login.", error });
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
          .json({ success: false, message: "User not found" });
      }
      res.status(200).json({ success: true, data: userInDB });
    } else {
      res.status(401).json({ success: false, message: "Unauthorized" });
    }
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Error fetching user", error });
  }
};

export const updateUser = async (req, res) => {
  const { id } = req.params;
  const updateFields = req.body;

  try {
    if (req.permissions !== "admin" && req.userID !== id) {
      return res
        .status(401)
        .json({ success: false, message: "Unauthorized to update this user" });
    }

    if (updateFields.password) {
      updateFields.password = await hashPassword(updateFields.password);
    }

    const updatedUser = await User.findByIdAndUpdate(
      id,
      { $set: updateFields },
      { new: true, runValidators: true }
    );

    if (!updatedUser) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    res.status(200).json({ success: true, data: updatedUser });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Error updating user", error });
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
          .json({ success: false, message: "User not found" });
      }
      res.status(200).json({ success: true, data: deletedUser });
    } else {
      res.status(401).json({ success: false, message: "Unauthorized" });
    }
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Error deleting user", error });
  }
};
