import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import morgan from "morgan";
import { connectDB } from "./config/db.js";
import authRouter from "./api/auth.routes.js";
import userRouter from "./api/user.routes.js";
import resortRouter from "./api/resort.routes.js";
import visualCrossingRouter from "./api/visualCrossing.routes.js";
import startVisualCrossingCron from "./cron/visualCrossingCron.js";
import { errorHandler } from "./middleware/errorMiddleware.js";

dotenv.config();

const envOrigin = process.env.ORIGIN;

const corsOptions = {
  "access-control-allow-origins": envOrigin,
  credentials: true,
  optionsSuccessStatus: 200,
};

const port = process.env.PORT || 5050;

const app = express();

// Middleware
app.use(morgan("dev")); // Logs requests to the console
app.use(cors(corsOptions));
app.use(express.json());

// Routes
app.use("/api/auth", authRouter);
app.use("/api/users", userRouter);
app.use("/api/resorts", resortRouter); // General resort routes
app.use("/api/visual-crossing", visualCrossingRouter); // Visual Crossing routes

// Error Handling Middleware
app.use(errorHandler); // Always include after all routes

// Start Server
app.listen(port, () => {
  connectDB(); // Initialize database connection
  console.log(`Server running on port ${port}`);

  // Start Visual Crossing Cron Job
  startVisualCrossingCron();
});
