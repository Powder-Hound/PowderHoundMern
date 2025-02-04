import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { connectDB } from "../config/db.js";
import { fetchVisualCrossingAlerts } from "../services/weatherAlertService.js";
import { Notification } from "../models/notification.model.js"; // Import Notification model

// Manually set .env path (Ensures it loads correctly)
dotenv.config({ path: path.resolve(process.cwd(), "../.env") });

// Debugging: Print environment variables to confirm they are loaded
console.log(
  "🔍 TWILIO_ACCOUNT_SID:",
  process.env.TWILIO_ACCOUNT_SID || "❌ NOT FOUND"
);
console.log(
  "🔍 TWILIO_AUTH_TOKEN:",
  process.env.TWILIO_AUTH_TOKEN || "❌ NOT FOUND"
);
console.log(
  "🔍 TWILIO_VERIFY_SERVICE_SID:",
  process.env.TWILIO_VERIFY_SERVICE_SID || "❌ NOT FOUND"
);
console.log(
  "🔍 TWILIO_PHONE_NUMBER:",
  process.env.TWILIO_PHONE_NUMBER || "❌ NOT FOUND"
);

const runTest = async () => {
  try {
    console.log("🔍 Running test: Checking notification deduplication...");

    // Connect to MongoDB
    await connectDB();
    console.log("✅ Connected to MongoDB");

    // Check for existing notifications within the last 24 hours
    const twentyFourHoursAgo = new Date();
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

    console.log(
      `🕒 Checking for notifications sent since: ${twentyFourHoursAgo.toISOString()}`
    );

    const recentNotifications = await Notification.find({
      createdAt: { $gte: twentyFourHoursAgo },
    });

    console.log(
      `📌 Found ${recentNotifications.length} recent notifications in DB.`
    );

    // Run notification logic
    const alerts = await fetchVisualCrossingAlerts();

    console.log("✅ Test Completed! Notifications Sent:", alerts);

    // Check if any new notifications were added (should be 0 if deduplication works)
    const afterTestNotifications = await Notification.find({
      createdAt: { $gte: twentyFourHoursAgo },
    });

    console.log(
      `📌 After test: ${afterTestNotifications.length} notifications in DB.`
    );

    if (afterTestNotifications.length > recentNotifications.length) {
      console.error("❌ Test Failed: Duplicate notifications were created!");
    } else {
      console.log("✅ Test Passed: No duplicate notifications were sent.");
    }
  } catch (error) {
    console.error("❌ Test Failed:", error);
  } finally {
    // Close the database connection
    mongoose.connection.close();
    console.log("🔌 Disconnected from MongoDB");
  }
};

// Run the test
//commands to run test
//export $(grep -v '^#' ../.env | xargs)

//node testNotifications.js
runTest();
