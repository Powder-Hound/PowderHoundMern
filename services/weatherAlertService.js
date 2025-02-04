import mongoose from "mongoose";
import { User } from "../models/users.model.js";
import { ResortWeatherData } from "../models/resortWeatherData.model.js";
import { Notification } from "../models/notification.model.js";
import { sendTextMessage } from "../utils/twilioService.js";
import { sendEmail } from "../utils/sendgridService.js";

export const fetchVisualCrossingAlerts = async () => {
  try {
    console.log("🚀 Fetching Visual Crossing alerts...");

    // Fetch users who have notifications enabled
    const users = await User.find(
      {
        $or: [
          { "notificationsActive.phone": true },
          { "notificationsActive.email": true },
        ],
      },
      "resortPreference notificationsActive alertThreshold areaCode phoneNumber email"
    );

    if (!users.length) {
      console.log("⚠️ No users have active notifications.");
      return [];
    }

    console.log(`📌 Found ${users.length} users to check for alerts.`);

    let notificationsSent = 0;
    let alerts = [];

    // Get timestamp for 24 hours ago
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    console.log(
      `🕒 Checking for notifications sent after: ${twentyFourHoursAgo.toISOString()}`
    );

    for (const user of users) {
      console.log(`🔎 Checking user: ${user._id}`);

      // Validate resort preferences
      if (
        !user.resortPreference ||
        !Array.isArray(user.resortPreference.resorts)
      ) {
        console.warn(
          `⚠️ Skipping user ${user._id} due to missing or invalid resortPreference.`
        );
        continue;
      }

      const preferredResorts = user.resortPreference.resorts.map(
        (id) => new mongoose.Types.ObjectId(id)
      );

      console.log(`🎯 Mapped Preferred Resorts:`, preferredResorts);

      // Fetch existing notifications from the last 24 hours
      const recentNotifications = await Notification.find({
        userId: user._id,
        resortId: { $in: preferredResorts },
        createdAt: { $gte: twentyFourHoursAgo },
      });

      console.log(
        `📌 Found ${recentNotifications.length} recent notifications.`
      );

      // Create a unique Set for recent notifications (to prevent duplicates)
      const recentNotificationSet = new Set(
        recentNotifications.map(
          (notif) =>
            `${notif.userId}-${notif.resortId}-${notif.alertDate.toISOString()}`
        )
      );

      console.log(
        "🛑 Existing Notification Keys in Set:",
        recentNotificationSet.size
      );

      // Fetch weather data for the user's preferred resorts
      const weatherData = await ResortWeatherData.find({
        resortId: { $in: preferredResorts },
      });

      console.log(
        `🌨️ Retrieved weather data for ${weatherData.length} resorts.`
      );

      for (const data of weatherData) {
        if (!data.weatherData || !data.weatherData.visualCrossing?.forecast) {
          console.warn(`⚠️ No forecast data for resort: ${data.resortId}`);
          continue;
        }

        for (const day of data.weatherData.visualCrossing.forecast) {
          const snowfall = day.snow?.value || 0;
          const alertDate = new Date(day.validTime);

          if (snowfall >= user.alertThreshold.preferredResorts) {
            const message = `❄️ Snow Alert: ${snowfall} inches expected at ${
              data.resortName
            } on ${alertDate.toISOString()}.`;
            const notificationKey = `${user._id}-${
              data.resortId
            }-${alertDate.toISOString()}`;

            console.log(
              `🔎 Checking if notification exists: ${notificationKey}`
            );
            if (recentNotificationSet.has(notificationKey)) {
              console.log(`⏳ Skipping duplicate notification: ${message}`);
              continue;
            }

            console.log(`🚀 Alert Created: ${message}`);
            recentNotificationSet.add(notificationKey);

            alerts.push({
              userId: user._id,
              resortId: data.resortId,
              alertDate,
              message,
            });

            // Ensure phone number format is valid before sending SMS
            const formattedPhoneNumber = `+${user.areaCode}${user.phoneNumber}`;
            if (!/^\+\d{10,15}$/.test(formattedPhoneNumber)) {
              console.error(
                `❌ Invalid phone number: ${formattedPhoneNumber}, skipping SMS.`
              );
            } else {
              try {
                if (user.notificationsActive.phone) {
                  await sendTextMessage(formattedPhoneNumber, message);
                }
              } catch (error) {
                console.warn(
                  `⚠️ SMS failed for ${formattedPhoneNumber}: ${error.message}`
                );
              }
            }

            try {
              if (user.notificationsActive.email) {
                await sendEmail(user.email, "Snow Alert", message);
              }
            } catch (error) {
              console.warn(
                `⚠️ Email failed for ${user.email}: ${error.message}`
              );
            }

            await Notification.create({
              userId: user._id,
              resortId: data.resortId,
              alertDate,
              message,
            });

            notificationsSent++;
            break; // Exit loop after first valid alert
          }
        }
      }
    }

    console.log(`✅ Sent ${notificationsSent} notifications.`);
    return alerts;
  } catch (error) {
    console.error("❌ Error fetching Visual Crossing alerts:", error);
    return [];
  }
};
