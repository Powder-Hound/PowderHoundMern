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
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );

  try {
    const savedUser = await newUser.save();
    res.status(201).json({ success: true, user: savedUser, token });
  } catch (error) {
    res.status(500).json({
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
        .json({ success: false, error: "Username already exists" });
    } else {
      return res.status(200).json({ success: true });
    }
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Error validating username" });
  }
};

export const login = async (req, res) => {
  const { phoneNumber, code } = req.body;

  try {
    const userInDB = await User.findOne({ phoneNumber });
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
