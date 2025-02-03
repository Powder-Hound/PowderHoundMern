import mongoose from "mongoose";
import { User } from "../models/users.model.js";
import { ResortWeatherData } from "../models/resortWeatherData.model.js";
import { Notification } from "../models/notification.model.js";
import { sendTextMessage } from "../utils/twilioService.js";
import { sendEmail } from "../utils/sendgridService.js";

export const fetchVisualCrossingAlerts = async () => {
  try {
    console.log("🚀 Fetching Visual Crossing alerts...");

    // Fetch users who enabled notifications
    const users = await User.find({
      $or: [
        { "notificationsActive.phone": true },
        { "notificationsActive.email": true },
      ],
    });

    if (!users.length) {
      console.log("⚠️ No users have active notifications.");
      return [];
    }

    console.log(`📌 Found ${users.length} users to check for alerts.`);

    let notificationsSent = 0;
    let alerts = [];

    for (const user of users) {
      const preferredResorts = user.resortPreference.resorts.map(
        (id) => new mongoose.Types.ObjectId(id)
      );

      // Fetch weather data for user's preferred resorts
      const weatherData = await ResortWeatherData.find({
        resortId: { $in: preferredResorts },
      });

      for (const data of weatherData) {
        if (!data.weatherData.visualCrossing?.forecast) continue;

        const { forecast } = data.weatherData.visualCrossing;

        // Iterate through forecast data to find the first date exceeding the threshold
        for (const day of forecast) {
          const { validTime, snow } = day;
          const snowfall = snow?.value || 0;

          if (snowfall >= user.alertThreshold.preferredResorts) {
            const message = `❄️ Snow Alert: ${snowfall} inches expected at ${data.resortName} on ${validTime}.`;

            alerts.push({
              userId: user._id,
              resortId: data.resortId,
              alertDate: validTime, // ✅ Attach predicted date
              message,
            });

            // Check if notification for this date was already sent
            const existingNotification = await Notification.findOne({
              userId: user._id,
              resortId: data.resortId,
              alertDate: validTime, // ✅ Now checking by date too!
            });

            if (!existingNotification) {
              // Send notifications via preferred method
              if (user.notificationsActive.phone) {
                await sendTextMessage(
                  `+${user.areaCode}${user.phoneNumber}`,
                  message
                );
              }
              if (user.notificationsActive.email) {
                await sendEmail(user.email, "Snow Alert", message);
              }

              // Store notification in DB with alertDate
              await Notification.create({
                userId: user._id,
                resortId: data.resortId,
                alertDate: validTime, // ✅ Save alert date
                message,
              });

              notificationsSent++;
            }
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
