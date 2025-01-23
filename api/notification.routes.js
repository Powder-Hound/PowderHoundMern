import express from "express";
import { triggerSnowNotifications } from "../controllers/notificationController.js";
import { verifyToken } from "../middleware/authMiddleware.js";

const notificationRouter = express.Router();

// Route to manually trigger snow notifications
notificationRouter.post("/trigger", verifyToken, triggerSnowNotifications);

export default notificationRouter;
