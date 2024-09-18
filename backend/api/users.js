import express from "express";
import { User } from "../models/users.model.js";
const userRouter = express.Router();
import argon2 from "argon2";

const hashPassword = async (password) => {
  try {
    const hash = await argon2.hash(password);
    return hash;
  } catch (err) {
    console.error(err);
  }
};

userRouter.post("/signup", async (req, res) => {
  const user = req.body;
  if (!user.username || !user.password || !user.phoneNumber) {
    res.status(400).json({ success: false, message: "Invalid request" });
  }
  user.username.toLowercase();
  const newUser = new User(user);
  newUser.password = await hashPassword(user.password);
  try {
    const savedUser = await newUser.save();
    res.status(201).json({ success: true, data: savedUser });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error saving user" });
  }
});

userRouter.get("/login", async (req, res) => {
  const { username, password } = req.body;
  try {
    const userInDB = await User.findOne({ username });
    if (userInDB && (await argon2.verify(userInDB.password, password))) {
      res.status(200).json({ success: true, data: userInDB });
    } else {
      res.status(401).json({ success: false, message: "Invalid credentials" });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: "Error retrieving users" });
  }
});

userRouter.put("/preferences/resorts", async (req, res) => {
  let prefs = {};
  if (req.body.resortPreference.skiPass) {
    prefs["resortPreference.skiPass"] = req.body.resortPreference.skiPass
  }
  if (req.body.resortPreference.resorts) {
    prefs["resortPreference.resorts"]= req.body.resortPreference.resorts
  }
  try {
    const updatedUser = await User.findByIdAndUpdate(
      req.body._id,
      {
        $addToSet: {...prefs},
      },
      { new: true },
    );
    res.status(200).json({ success: true, data: updatedUser });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Error updating user", error: error });
  }
});

userRouter.put("/preferences/alertThreshold", async (req, res) => {
  let prefs = {};
  if (req.body.alertThreshold.preferredResorts) {
    prefs["alertThreshold.preferredResorts"] = req.body.alertThreshold.preferredResorts
  }
  if (req.body.alertThreshold.anyResort) {
    prefs["alertThreshold.anyResort"]= req.body.alertThreshold.anyResort
  }
  try {
    const updatedUser = await User.findByIdAndUpdate(
      req.body._id,
      {$set: {...prefs}},
      { new: true },
    );
    res.status(200).json({ success: true, data: updatedUser });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Error updating user", error: error });
  }
});

userRouter.delete("/", async (req, res) => {
  try {
    const deletedUser = await User.findByIdAndDelete(req.body._id);
    res.status(200).json({ success: true, data: deletedUser });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error deleting user" });
  }
});

export default userRouter;
