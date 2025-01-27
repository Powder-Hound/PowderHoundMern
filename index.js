import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import morgan from "morgan";
import swaggerUi from "swagger-ui-express";
import swaggerJsDoc from "swagger-jsdoc";
import swaggerOptions from "./swaggerConfig.js";
import { connectDB } from "./config/db.js";
import authRouter from "./api/auth.routes.js";
import userRouter from "./api/user.routes.js";
import resortRouter from "./api/resort.routes.js";
import visualCrossingRouter from "./api/visualCrossing.routes.js";
import skiAreaRouter from "./api/ski-areas.routes.js";
import startVisualCrossingCron from "./cron/visualCrossingCron.js";
import notificationRouter from "./api/notification.routes.js";
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

// Swagger configuration
const swaggerDocs = swaggerJsDoc(swaggerOptions);

// Middleware
app.use(morgan("dev")); // Logs requests to the console
app.use(cors(corsOptions));
app.use(express.json());

// Swagger UI
app.use(
  "/api-docs",

  swaggerUi.serve,
  swaggerUi.setup(swaggerDocs)
);

// Routes
app.use("/api/auth", authRouter);
app.use("/api/users", userRouter);
app.use("/api/resorts", resortRouter);
app.use("/api/visual-crossing", visualCrossingRouter);
app.use("/api/ski-areas", skiAreaRouter);
app.use("/api/notifications", notificationRouter);

// Error Handling Middleware
app.use(errorHandler); // Always include after all routes

// Start Server
app.listen(port, () => {
  connectDB(); // Initialize database connection
  console.log(`Server running on port ${port}`);

  // Start Visual Crossing Cron Job
  startVisualCrossingCron();
});
