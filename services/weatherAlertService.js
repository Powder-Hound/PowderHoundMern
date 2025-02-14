import mongoose from "mongoose";
import { User } from "../models/users.model.js";
import { ResortWeatherData } from "../models/resortWeatherData.model.js";
import { Notification } from "../models/notification.model.js";
import { ExpediaLink } from "../models/expediaLink.model.js";
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

    for (const user of users) {
      console.log(`🔎 Checking user: ${user._id}`);

      if (
        !user.resortPreference ||
        !Array.isArray(user.resortPreference.resorts)
      ) {
        console.warn(
          `⚠️ Skipping user ${user._id} due to invalid resortPreference.`
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

      const recentNotificationSet = new Set(
        recentNotifications.map(
          (notif) =>
            `${notif.userId}-${notif.resortId}-${notif.alertDate.toISOString()}`
        )
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

        // ✅ Fetch Expedia links for the resort
        const expediaData = await ExpediaLink.findOne({
          resortId: data.resortId,
        });
        console.log(
          `🛎️ Expedia Data for Resort (${data.resortId}):`,
          expediaData
        );

        const expediaLinksSent = !!expediaData; // True if Expedia links exist
        const expediaLinkId = expediaData ? expediaData._id : null;

        if (expediaData) {
          console.log(
            `✅ Found Expedia links for ${data.resortId}:`,
            expediaData.links
          );
        } else {
          console.warn(`⚠️ No Expedia links found for ${data.resortId}`);
        }

        // Iterate over each forecast day for this resort
        for (const day of data.weatherData.visualCrossing.forecast) {
          const snowfall = day.snow?.value || 0;
          const alertDate = new Date(day.validTime);

          if (snowfall >= user.alertThreshold.preferredResorts) {
            const notificationKey = `${user._id}-${
              data.resortId
            }-${alertDate.toISOString()}`;

            if (recentNotificationSet.has(notificationKey)) {
              console.log(`⏳ Skipping duplicate notification.`);
              continue;
            }

            // Construct message with Expedia links
            let message = `❄️ Snow Alert: ${snowfall} inches expected at ${
              data.resortName
            } on ${alertDate.toISOString()}.`;

            if (expediaData) {
              message += `\n\n🏨 Lodging options:\n${expediaData.links.join(
                "\n"
              )}`;
            } else {
              message += `\n\nNo Expedia lodging links available.`;
            }

            console.log(`🚀 Alert Created: ${message}`);
            recentNotificationSet.add(notificationKey);

            alerts.push({
              userId: user._id,
              resortId: data.resortId,
              alertDate,
              message,
            });

            // Send SMS and Email Notifications
            const formattedPhoneNumber = `${user.phoneNumber}`;
            try {
              if (user.notificationsActive.phone) {
                await sendTextMessage(formattedPhoneNumber, message);
              }
            } catch (error) {
              console.warn(
                `⚠️ SMS failed for ${formattedPhoneNumber}: ${error.message}`
              );
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

            // ✅ Save the notification with a proper reference to ExpediaLink
            const newNotification = await Notification.create({
              userId: user._id,
              resortId: data.resortId,
              alertDate,
              message,
              expediaLinksSent,
              expediaLinkId,
            });

            console.log("📨 Saved notification:", newNotification);

            notificationsSent++;
            // Note: The 'break' statement has been removed so that all forecast days are processed.
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
