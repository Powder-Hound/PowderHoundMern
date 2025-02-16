// models/aggregatedNotification.model.js
import mongoose from "mongoose";

const AggregatedNotificationSchema = new mongoose.Schema({
  userId: { type: mongoose.Types.ObjectId, ref: "User", required: true },
  notificationIds: [{ type: mongoose.Types.ObjectId, ref: "Notification" }], // Field for individual notification IDs
  combinedMessage: { type: String, required: true },
  sentAt: { type: Date, default: Date.now },
});

export const AggregatedNotification = mongoose.model(
  "AggregatedNotification",
  AggregatedNotificationSchema
);
