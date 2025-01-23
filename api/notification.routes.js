import express from "express";
import {
  triggerSnowNotifications,
  createNotification,
  getNotifications,
  deleteNotification,
} from "../controllers/notificationController.js";
import { verifyToken } from "../middleware/authMiddleware.js";

const notificationRouter = express.Router();

// Route to trigger snow notifications
notificationRouter.post("/trigger", verifyToken, triggerSnowNotifications);

// Route to manually create a notification
notificationRouter.post("/", verifyToken, createNotification);

// Route to fetch notifications
notificationRouter.get("/", verifyToken, getNotifications);

// Route to delete a notification by ID
notificationRouter.delete("/:id", verifyToken, deleteNotification);

export default notificationRouter;
