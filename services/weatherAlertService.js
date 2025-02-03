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

    for (const user of users) {
      console.log(`🔎 Checking user: ${user._id}`);
      console.log(
        "🏔️ Resort Preference:",
        JSON.stringify(user.resortPreference, null, 2)
      );

      if (!user.resortPreference || typeof user.resortPreference !== "object") {
        console.warn(
          `⚠️ Skipping user ${user._id} due to missing resortPreference.`
        );
        continue;
      }

      // Ensure resorts exist and are an array
      if (
        !user.resortPreference.resorts ||
        !Array.isArray(user.resortPreference.resorts)
      ) {
        console.warn(`⚠️ User ${user._id} has no preferred resorts listed.`);
        continue;
      }

      if (user.resortPreference.resorts.length === 0) {
        console.warn(
          `⚠️ User ${user._id} has an empty preferred resorts list.`
        );
        continue;
      }

      const preferredResorts = user.resortPreference.resorts.map(
        (id) => new mongoose.Types.ObjectId(id)
      );

      console.log(`🎯 Mapped Preferred Resorts:`, preferredResorts);

      // Fetch weather data for user's preferred resorts
      const weatherData = await ResortWeatherData.find({
        resortId: { $in: preferredResorts },
      });

      console.log(
        `🌨️ Weather Data Retrieved:`,
        JSON.stringify(weatherData, null, 2)
      );

      for (const data of weatherData) {
        if (!data.weatherData || !data.weatherData.visualCrossing?.forecast) {
          console.warn(`⚠️ No forecast data for resort: ${data.resortId}`);
          continue;
        }

        const { forecast } = data.weatherData.visualCrossing;
        for (const day of forecast) {
          const { validTime, snow } = day;
          const snowfall = snow?.value || 0;

          if (snowfall >= user.alertThreshold.preferredResorts) {
            const message = `❄️ Snow Alert: ${snowfall} inches expected at ${data.resortName} on ${validTime}.`;

            console.log(`🚀 Alert Created: ${message}`);

            alerts.push({
              userId: user._id,
              resortId: data.resortId,
              alertDate: validTime,
              message,
            });

            const existingNotification = await Notification.findOne({
              userId: user._id,
              resortId: data.resortId,
              alertDate: validTime,
            });

            if (!existingNotification) {
              if (user.notificationsActive.phone) {
                await sendTextMessage(
                  `+${user.areaCode}${user.phoneNumber}`,
                  message
                );
              }
              if (user.notificationsActive.email) {
                await sendEmail(user.email, "Snow Alert", message);
              }

              await Notification.create({
                userId: user._id,
                resortId: data.resortId,
                alertDate: validTime,
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
