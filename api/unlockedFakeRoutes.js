import express from "express";
import { verifyToken } from "../middleware/authMiddleware.js";
import { getUnlockedFake } from "../controllers/unlockedFakeController.js";

const unlockedFakeRouter = express.Router();

// Define the endpoint for the unlocked fake dataset
unlockedFakeRouter.get("/unlocked", verifyToken, getUnlockedFake);

export default unlockedFakeRouter;
