import express from "express";
import { User } from "../models/users.model.js";
const userRouter = express.Router();
import argon2 from "argon2";
import jwt from "jsonwebtoken";
import verifyToken from "../middleware/authMiddleware.js";

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
  user["username"] = user["username"].toLowerCase();
  const userInDB = await User.findOne({ username: user["username"] });
  const phonenumberInDB = await User.findOne({ phoneNumber: user["phoneNumber"] });
  if (!user.username || !user.password || !user.phoneNumber) {
    res.status(400).json({ success: false, message: "Invalid request" });
  } else if (userInDB || phonenumberInDB) {
      res.status(400).json({ success: false, message: `${(userInDB) ? "Username" : "Phone number"} already exists`});
  } else {
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
      res.status(201).json({ success: true, data: savedUser, token: token });
    } catch (error) {
      res.status(500).json({ success: false, message: "Error saving user", error: error});
    }
  }
});

userRouter.get("/login", async (req, res) => {
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
          token: token,
        });
    } else {
      res.status(401).json({ success: false, message: "Invalid credentials" });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: "Error retrieving users" });
  }
});

userRouter.put("/preferences/resorts", verifyToken, async (req, res) => {
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
});

userRouter.put("/preferences/alertThreshold", verifyToken, async (req, res) => {
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
});

userRouter.delete("/:id", verifyToken, async (req, res) => {
  try {
    if ((req.privileges === "admin") || (req.userID === req.params.id)) {
      const deletedUser = await User.findByIdAndDelete(req.userID);
      res.status(200).json({ success: true, data: deletedUser });  
    } else {
      res.status(401).json({ success: false, message: "Unauthorized" });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: "Error deleting user" });
  }
});

export default userRouter;
