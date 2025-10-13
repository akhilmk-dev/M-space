const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    title: { type: String, required: true },
    message: { type: String, required: true },
    type: { type: String, default: "info" }, // e.g., "assignment", "alert", "reminder"
    status: {
      type: String,
      enum: ["unread", "read"],
      default: "unread",
    },
    extraData: { type: mongoose.Schema.Types.Mixed }, // optional: store assignmentId, URL, etc.
    sentVia: { type: String, enum: ["onesignal", "sms", "email"], default: "onesignal" },
    playerId: { type: String }, // optional, store OneSignal player ID if available
    webUrl: { type: String }, // optional
    readAt: { type: Date }, // optional, set when user opens notification
  },
  { timestamps: true }
);

module.exports = mongoose.model("Notification", notificationSchema);
