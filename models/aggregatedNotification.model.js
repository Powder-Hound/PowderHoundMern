// models/aggregatedNotification.model.js
import mongoose from "mongoose";

const AggregatedNotificationSchema = new mongoose.Schema({
  userId: { type: mongoose.Types.ObjectId, ref: "User", required: true },
  notificationIds: [{ type: mongoose.Types.ObjectId, ref: "Notification" }],
  emailMessage: { type: String, required: true }, // New field for email copy
  smsMessage: { type: String, required: true }, // New field for SMS copy
  sentAt: { type: Date, default: Date.now },
});

export const AggregatedNotification = mongoose.model(
  "AggregatedNotification",
  AggregatedNotificationSchema
);
