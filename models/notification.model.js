import mongoose from "mongoose";
const Schema = mongoose.Schema;

// Define the schema
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
      default: null, // Stores the reference to the ExpediaLink document
    },
  },
  {
    timestamps: true, // Adds createdAt and updatedAt fields automatically
  }
);

// Create the model
export const Notification = mongoose.model(
  "Notification",
  notificationSchema,
  "notifications"
);
