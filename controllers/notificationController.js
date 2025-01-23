import { fetchSnowAlerts } from "../services/weatherAlertService.js";
import { Notification } from "../models/Notification.js";

// Trigger snow notifications (cron or manual trigger)
export const triggerSnowNotifications = async (req, res) => {
  try {
    await fetchSnowAlerts();
    res.status(200).send({
      message: "Snow notifications triggered successfully.",
    });
  } catch (error) {
    console.error("Error triggering snow notifications:", error);
    res.status(500).send({
      message: "Error triggering notifications.",
      error: error.message,
    });
  }
};

// Create a custom notification manually
export const createNotification = async (req, res) => {
  try {
    const { userId, resortId, message } = req.body;

    if (!userId || !resortId || !message) {
      return res.status(400).send({
        message: "All fields (userId, resortId, message) are required.",
      });
    }

    const newNotification = new Notification({
      userId,
      resortId,
      message,
    });

    const savedNotification = await newNotification.save();
    res.status(201).send(savedNotification);
  } catch (error) {
    console.error("Error creating notification:", error);
    res.status(500).send({
      message: "Error creating notification.",
      error: error.message,
    });
  }
};

// Fetch notifications (all or filtered by userId)
export const getNotifications = async (req, res) => {
  try {
    const { userId } = req.query;

    const query = userId ? { userId } : {};
    const notifications = await Notification.find(query).populate(
      "userId resortId"
    );

    res.status(200).send(notifications);
  } catch (error) {
    console.error("Error fetching notifications:", error);
    res.status(500).send({
      message: "Error fetching notifications.",
      error: error.message,
    });
  }
};

// Delete a notification by ID
export const deleteNotification = async (req, res) => {
  try {
    const { id } = req.params;

    const deletedNotification = await Notification.findByIdAndDelete(id);

    if (!deletedNotification) {
      return res.status(404).send({
        message: "Notification not found.",
      });
    }

    res.status(200).send({
      message: "Notification deleted successfully.",
      notification: deletedNotification,
    });
  } catch (error) {
    console.error("Error deleting notification:", error);
    res.status(500).send({
      message: "Error deleting notification.",
      error: error.message,
    });
  }
};
