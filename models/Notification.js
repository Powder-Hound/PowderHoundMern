const mongoose = require("mongoose");

const NotificationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  resortId: { type: mongoose.Schema.Types.ObjectId, ref: "Resort" },
  message: String,
  sentAt: { type: Date, default: Date.now },
  responseStatus: { type: String, enum: ["sent", "failed"], default: "sent" },
});

module.exports = mongoose.model("Notification", NotificationSchema);
