import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import { connectDB } from "./config/db.js";
import authRouter from "./api/auth.routes.js";
import userRouter from "./api/user.routes.js";
import resortRouter from "./api/resort.routes.js";
import visualCrossingRouter from "./api/visualCrossing.routes.js";

dotenv.config();

const envOrigin = process.env.ORIGIN;

const corsOptions = {
  "access-control-allow-origins": envOrigin,
  credentials: true,
  optionsSuccessStatus: 200,
};

const port = process.env.PORT || 5050;

const app = express();
app.use(cors(corsOptions));
app.use(express.json());

// Routes
app.use("/api/auth", authRouter);
app.use("/api/users", userRouter);
app.use("/api/resorts", resortRouter); // General resort routes
app.use("/api/visual-crossing", visualCrossingRouter);

// Uncomment these for manual fetch during testing
// await getAllNOAAData();
// await getAllWeatherBitData();
// await getAllVisualCrossingData();
// await checkResorts();

app.listen(port, () => {
  connectDB();
  console.log(`Server running on port ${port}`);
});
