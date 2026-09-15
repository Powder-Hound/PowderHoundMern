import mongoose from "mongoose";
import { Notification } from "../models/notification.model.js";
import { User } from "../models/users.model.js";
import { fetchVisualCrossingAlerts } from "../services/weatherAlertService.js";
import {
  STORM_ALERTS_LOCKED_MESSAGE,
  isPowderAlertCronEnabled,
} from "../utils/stormAlertGate.js";

// API to manually trigger snow alerts
export const triggerVisualCrossingNotifications = async (req, res) => {
  try {
    if (!isPowderAlertCronEnabled()) {
      return res.status(403).send({
        success: false,
        message: STORM_ALERTS_LOCKED_MESSAGE,
      });
    }
    const alerts = await fetchVisualCrossingAlerts(); // ✅ CORRECT FUNCTION NAME
    res.status(200).send({
      success: true,
      message: "Visual Crossing notifications triggered successfully.",
      data: alerts,
    });
  } catch (error) {
    console.error("❌ Error triggering notifications:", error);
    res.status(500).send({
      success: false,
      message: "Error triggering notifications.",
      error: error.message,
    });
  }
};

// Manually create a notification
export const createNotification = async (req, res) => {
  try {
    let { userId, resortId, message } = req.body;

    if (!userId || !resortId || !message) {
      return res.status(400).send({
        message: "All fields (userId, resortId, message) are required.",
      });
    }

    console.log("📌 Creating notification for user:", userId);

    const user = await User.findById(userId);
    if (!user) {
      console.log("❌ User not found:", userId);
      return res.status(400).send({ message: "Invalid userId provided." });
    }

    const notification = await Notification.create({
      userId: new mongoose.Types.ObjectId(userId),
      resortId: new mongoose.Types.ObjectId(resortId),
      message,
    });

    console.log("✅ Notification created:", notification);

    res.status(201).send(notification);
  } catch (error) {
    console.error("❌ Error creating notification:", error);
    res
      .status(500)
      .send({ message: "Error creating notification.", error: error.message });
  }
};

// Fetch notifications for a user
export const getNotifications = async (req, res) => {
  try {
    const { userId } = req.query;
    const query = userId ? { userId: new mongoose.Types.ObjectId(userId) } : {};

    console.log("🔍 Fetching notifications...");

    const notifications = await Notification.find(query);

    console.log(`📌 Retrieved ${notifications.length} notifications.`);

    res.status(200).send(notifications);
  } catch (error) {
    console.error("❌ Error fetching notifications:", error);
    res
      .status(500)
      .send({ message: "Error fetching notifications.", error: error.message });
  }
};

// Delete a notification by ID
export const deleteNotification = async (req, res) => {
  try {
    const { id } = req.params;

    console.log("🗑️ Deleting notification ID:", id);

    const deletedNotification = await Notification.findByIdAndDelete(id);

    if (!deletedNotification) {
      return res.status(404).send({ message: "Notification not found." });
    }

    console.log("✅ Notification deleted:", deletedNotification);

    res.status(200).send({
      message: "Notification deleted successfully.",
      notification: deletedNotification,
    });
  } catch (error) {
    console.error("❌ Error deleting notification:", error);
    res
      .status(500)
      .send({ message: "Error deleting notification.", error: error.message });
  }
};
