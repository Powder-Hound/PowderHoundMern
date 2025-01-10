const express = require("express");
const router = express.Router();
const {
  triggerSnowNotifications,
} = require("../controllers/notificationController");
const protect = require("../middleware/authMiddleware");

// Protected route for triggering notifications
router.post("/trigger", protect, triggerSnowNotifications);

module.exports = router;
