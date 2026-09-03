import mongoose from "mongoose";
import { User } from "../models/users.model.js";
import argon2 from "argon2";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import { digitsPhone } from "../utils/phone.js";
import {
  applyContestOnUserSave,
  clientIpFromReq,
  isFinishedGo,
  planFollowClaim,
  sanitizeUserWrite,
} from "../utils/contest.js";
dotenv.config();

const phoneLookupFilter = (phoneNumber) => {
  const digits = digitsPhone(phoneNumber);
  const or = [];
  if (phoneNumber) or.push({ phoneNumber });
  if (digits) {
    or.push({ phoneNumber: digits }, { phoneNumber: `+${digits}` });
  }
  return or.length ? { $or: or } : { phoneNumber: null };
};

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
  const user = req.body || {};
  const phoneNumber = digitsPhone(user.phoneNumber);

  if (!phoneNumber || !user.phoneVerifySID) {
    return res.status(400).send({
      success: false,
      message: "phoneNumber and phoneVerifySID are required",
    });
  }

  const { referredBy, safeFields: safeUser } = sanitizeUserWrite(user);

  const newUser = new User({
    ...safeUser,
    name: safeUser.name ?? "",
    phoneNumber,
    referredBy,
    referralCreditEligible: true,
  });

  if (newUser.password) {
    newUser.password = await hashPassword(safeUser.password);
  }

  const token = jwt.sign(
    {
      username: newUser.name,
      userID: String(newUser._id),
      permissions: newUser.permissions,
    },
    process.env.JWT_SECRET
  );

  try {
    const savedUser = await newUser.save();
    const finalUser = await applyContestOnUserSave({
      user: savedUser,
      wasAlreadyFinished: false,
      clientIp: clientIpFromReq(req),
    });
    res.status(201).send({ user: finalUser, token });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).send({
        success: false,
        message: "Phone number already registered",
      });
    }
    res.status(500).send({
      success: false,
      message: "Error saving user",
      error: error?.message || error,
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
  const { phoneNumber } = req.body;

  try {
    const userInDB = await User.findOne(phoneLookupFilter(phoneNumber));
    if (!userInDB) {
      return res.status(404).send({
        success: false,
        message: "User not found. Please register first.",
      });
    }

    const token = jwt.sign(
      {
        username: userInDB.name,
        userID: String(userInDB._id),
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

    const { referredBy, safeFields } = sanitizeUserWrite(updateFields);
    for (const key of Object.keys(updateFields)) {
      delete updateFields[key];
    }
    Object.assign(updateFields, safeFields);

    if (updateFields.phoneNumber) {
      const digits = digitsPhone(updateFields.phoneNumber);
      if (!digits) {
        return res.status(400).send({
          success: false,
          message: "phoneNumber is invalid",
        });
      }
      updateFields.phoneNumber = digits;
    }

    // Convert resortPreference.resorts to an array of ObjectIds
    if (
      updateFields.resortPreference &&
      updateFields.resortPreference.resorts
    ) {
      if (!Array.isArray(updateFields.resortPreference.resorts)) {
        return res
          .status(400)
          .send({ success: false, message: "Resorts must be an array" });
      }

      try {
        updateFields.resortPreference.resorts =
          updateFields.resortPreference.resorts.map(
            (resortId) => new mongoose.Types.ObjectId(String(resortId))
          );
      } catch {
        return res.status(400).send({
          success: false,
          message: "Resorts must be valid MongoDB ObjectIds",
        });
      }
    }

    // 🔹 Hash new password if provided
    if (updateFields.password) {
      updateFields.password = await hashPassword(updateFields.password);
    }

    console.log("Processed update fields:", updateFields);

    const existingUser = await User.findById(id);
    if (!existingUser) {
      return res
        .status(404)
        .send({ success: false, message: "User not found" });
    }

    if (referredBy && !existingUser.referredBy) {
      updateFields.referredBy = referredBy;
    }

    const wasAlreadyFinished = isFinishedGo(existingUser);

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

    const finalUser = await applyContestOnUserSave({
      user: updatedUser,
      wasAlreadyFinished,
      clientIp: clientIpFromReq(req),
    });

    console.log("User updated successfully:", finalUser);
    res.status(200).send({ success: true, data: finalUser });
  } catch (error) {
    console.error("Update Error:", error);
    res
      .status(500)
      .send({ success: false, message: "Error updating user", error });
  }
};

export const claimFollowExtra = async (req, res) => {
  const { id } = req.params;

  try {
    if (req.permissions !== "admin" && req.userID !== id) {
      return res
        .status(401)
        .send({ success: false, message: "Unauthorized to claim follows for this user" });
    }

    const user = await User.findById(id);
    if (!user) {
      return res
        .status(404)
        .send({ success: false, message: "User not found" });
    }

    const plan = planFollowClaim({
      user: user.toObject(),
      network: req.body?.network,
      handle: req.body?.handle,
    });

    if (!plan.ok) {
      return res.status(plan.status || 400).send({
        success: false,
        message: "network must be x, tiktok, instagram, or facebook",
        reason: plan.reason,
      });
    }

    if (!plan.noop) {
      user.followClaims = plan.followClaims;
      user.entries = plan.entries;
      await user.save();
    }

    return res.status(200).send({
      success: true,
      claimed: true,
      noop: Boolean(plan.noop),
      network: req.body?.network,
      reason: plan.reason,
      data: user,
    });
  } catch (error) {
    return res.status(500).send({
      success: false,
      message: "Error claiming follow extra",
      error: error?.message || error,
    });
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
