import express from 'express';
import dotenv from 'dotenv';
import { connectDB } from './config/db.js';
import { User } from './models/users.model.js';
dotenv.config();

const port = process.env.PORT || 3000;

const app = express();
app.use(express.json());

app.post("/api/users", async (req, res) => {
  const user = req.body;
  if (!user.username || !user.password || !user.phoneNumber) {
    res.status(400).json({success:false, message: "Invalid request"});
  }
  const newUser = new User(user);

  try {
    const savedUser = await newUser.save();
    res.status(201).json({success: true, data: savedUser});
  } catch (error) {
    res.status(500).json({success:false, message: "Error saving user"});
  }
})

app.listen(port, () => {
  connectDB();
  console.log(`Server running on port ${port}`);
});