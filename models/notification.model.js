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
    // Optional storm window. Legacy rows omit these and stay valid.
    stormStart: { type: Date },
    stormEnd: { type: Date },
    peakInches: { type: Number },
    totalInches: { type: Number },
    leadDays: { type: Number },
    stormRole: {
      type: String,
      enum: ["new", "checkpoint", "upgrade", "monitoring"],
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
