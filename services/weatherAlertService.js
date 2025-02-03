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

        // Check snowfall threshold within user's preferred timeframe
        const snowfall = forecast
          .slice(0, user.alertThreshold.snowfallPeriod / 24)
          .reduce((total, day) => total + (day.snow.value || 0), 0);

        if (snowfall >= user.alertThreshold.preferredResorts) {
          const message = `❄️ Snow Alert: ${snowfall} inches expected at ${data.resortName}.`;

          alerts.push({
            userId: user._id,
            resortId: data.resortId,
            message,
          });

          // Check if notification already sent today
          const lastNotification = await Notification.findOne({
            userId: user._id,
            resortId: data.resortId,
            createdAt: { $gte: new Date().setHours(0, 0, 0, 0) },
          });

          if (!lastNotification) {
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

            // Store notification in DB
            await Notification.create({
              userId: user._id,
              resortId: data.resortId,
              message,
            });

            notificationsSent++;
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
