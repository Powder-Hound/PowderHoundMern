import mongoose from "mongoose";
const Schema = mongoose.Schema;

const notificationSchema = new Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    resortId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Resort",
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    alertDate: {
      // <-- Add this field
      type: Date,
      required: true,
    },
    sentAt: {
      type: Date,
      default: Date.now,
    },
    responseStatus: {
      type: String,
      enum: ["sent", "failed"],
      default: "sent",
    },
    expediaLinksSent: {
      type: Boolean,
      default: false,
    },
    expediaLinkId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ExpediaLink",
      default: null,
    },
  },
  {
    timestamps: true, // Adds createdAt and updatedAt fields automatically
  }
);

export const Notification = mongoose.model(
  "Notification",
  notificationSchema,
  "notifications"
);
