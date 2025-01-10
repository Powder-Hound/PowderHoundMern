import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import { connectDB } from "./config/db.js";
import authRouter from "./api/auth.routes.js";
import userRouter from "./api/user.routes.js";
import resortRouter from "./api/resort.routes.js";
import visualCrossingRouter from "./api/visualCrossing.routes.js";
import startVisualCrossingCron from "./cron/visualCrossingCron.js";

dotenv.config();

const envOrigin = process.env.ORIGIN || "*"; // Default to "*" if ORIGIN is not set

// Set up CORS options
const corsOptions = {
  origin: envOrigin, // This reads the origin from the environment variable
  credentials: true, // Allow cookies for requests
  optionsSuccessStatus: 200, // Compatibility for legacy browsers
};

const port = process.env.PORT || 5050; // Ensure this variable is used for server startup

const app = express();

// Middleware
app.use(cors(corsOptions)); // Apply CORS settings
app.use(express.json()); // Parse incoming JSON payloads

// Routes
app.use("/api/auth", authRouter);
app.use("/api/users", userRouter);
app.use("/api/resorts", resortRouter);
app.use("/api/visual-crossing", visualCrossingRouter);

// Server start and database connection
app.listen(port, () => {
  connectDB(); // Ensure database is connected on startup
  console.log(`Server running on port ${port}`);

  // Start scheduled cron jobs
  startVisualCrossingCron();
});

// Error Handling for Uncaught Exceptions and Rejections
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
  process.exit(1); // Exit process to avoid unpredictable behavior
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection:", reason);
  console.error("Promise causing rejection:", promise);
});
