import mongoose from "mongoose";
import { User } from "../models/users.model.js";
import { ResortWeatherData } from "../models/resortWeatherData.model.js";
import { Notification } from "../models/notification.model.js";
import { ExpediaLink } from "../models/expediaLink.model.js";
import { sendTextMessage } from "../utils/twilioService.js";
import { sendEmail } from "../utils/sendgridService.js";
import { AggregatedNotification } from "../models/aggregatedNotification.model.js";
import { splitAggregatedMessages } from "../utils/smsUtils.js"; // SMS splitting utility
import { splitAggregatedEmailMessages } from "../utils/emailUtils.js"; // Email splitting utility

export const fetchVisualCrossingAlerts = async () => {
  try {
    console.log("🚀 Fetching Visual Crossing alerts...");

    // Fetch users who have notifications enabled
    const users = await User.find(
      {
        $or: [
          { "notificationsActive.phone": true },
          { "notificationsActive.email": true },
          { "notificationsActive.pushNotification": true },
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

    // Process each user
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

      // Fetch weather data for the user's preferred resorts
      const weatherData = await ResortWeatherData.find({
        resortId: { $in: preferredResorts },
      });

      console.log(
        `🌨️ Retrieved weather data for ${weatherData.length} resorts.`
      );

      // Array to accumulate alert messages for this user
      const userAlerts = [];
      // Array to store individual notification IDs for the aggregated notification
      const userNotificationIds = [];

      // Loop through weather data for each resort
      for (const data of weatherData) {
        if (!data.weatherData || !data.weatherData.visualCrossing?.forecast) {
          console.warn(`⚠️ No forecast data for resort: ${data.resortId}`);
          continue;
        }

        // Fetch Expedia links for the resort
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

        // Flag to ensure we add the "Book Now!" link only once per resort
        let lodgingLinkAdded = false;

        // Iterate over each forecast day for this resort
        for (const day of data.weatherData.visualCrossing.forecast) {
          const snowfall = day.snow?.value || 0;
          const alertDate = new Date(day.validTime);

          if (snowfall >= user.alertThreshold.preferredResorts) {
            // Format the date (e.g., "Feb 16")
            const dateStr = alertDate.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            });

            let message = "";
            // Prepend the "Book Now!" line before the PowAlert message (only once per resort)
            if (!lodgingLinkAdded) {
              if (
                expediaData &&
                expediaData.links &&
                expediaData.links.length > 0
              ) {
                message += `🏨 Book Now! --> ${expediaData.links[0]}\n`;
              } else {
                message += `🏨 No lodging links available.\n`;
              }
              lodgingLinkAdded = true;
            }
            // Append the PowAlert message
            message += `❄️ PowAlert: ${snowfall}in @ ${data.resortName} on ${dateStr}.`;

            console.log(`🚀 Alert Created: ${message}`);

            // Upsert the individual notification record.
            // This will update an existing notification (if any) or create a new one.
            let notification;
            try {
              notification = await Notification.findOneAndUpdate(
                {
                  userId: user._id,
                  resortId: data.resortId,
                  alertDate,
                },
                {
                  message,
                  expediaLinksSent,
                  expediaLinkId,
                  createdAt: new Date(),
                },
                { upsert: true, new: true }
              );
              console.log("✅ Notification upserted:", notification);
              userNotificationIds.push(notification._id);
            } catch (error) {
              console.error(
                `❌ Error upserting notification for user ${user._id}:`,
                error
              );
              continue;
            }

            // Add the message to the user's alert list
            userAlerts.push(message);

            // Also keep track of the alert details (if needed elsewhere)
            alerts.push({
              userId: user._id,
              resortId: data.resortId,
              alertDate,
              message,
            });
          }
        }
      }

      // If the user has any alerts, bundle them into one message and send notifications
      if (userAlerts.length > 0) {
        // Header to be added at the top of every notification
        const header =
          "Check your PowAlert Dashboard for live weather updates --> https://powalert.com/";

        // Build the combined message for email and SMS
        const emailAlerts = [header, ...userAlerts];
        const smsAlerts = [header, ...userAlerts];

        // Split the messages into segments if needed
        const emailSegments = splitAggregatedEmailMessages(emailAlerts);
        const smsSegments = splitAggregatedMessages(smsAlerts);

        console.log(
          `📤 Sending combined notification to user ${user._id}:\n`,
          emailSegments.join("\n\n----------------------\n\n")
        );

        // Send SMS if the user has phone notifications enabled
        const formattedPhoneNumber = `${user.phoneNumber}`;
        if (user.notificationsActive.phone) {
          for (const segment of smsSegments) {
            try {
              await sendTextMessage(formattedPhoneNumber, segment);
            } catch (error) {
              console.warn(
                `⚠️ SMS failed for ${formattedPhoneNumber} segment: ${error.message}`
              );
            }
          }
        }

        // Send Email if the user has email notifications enabled
        if (user.notificationsActive.email) {
          for (const segment of emailSegments) {
            try {
              await sendEmail(user.email, "PowAlerts", segment);
            } catch (error) {
              console.warn(
                `⚠️ Email failed for ${user.email} segment: ${error.message}`
              );
            }
          }
        }

        // Save the aggregated notification record,
        // capturing both the full email copy and SMS copy.
        try {
          await AggregatedNotification.create({
            userId: user._id,
            notificationIds: userNotificationIds,
            emailMessage: emailAlerts.join("\n\n----------------------\n\n"),
            smsMessage: smsAlerts.join("\n\n----------------------\n\n"),
            sentAt: new Date(),
          });
          console.log("✅ Aggregated Notification saved for user", user._id);
        } catch (error) {
          console.error(
            `❌ Error saving aggregated notification for user ${user._id}:`,
            error
          );
        }

        notificationsSent++;
      }
    }

    console.log(`✅ Sent notifications to ${notificationsSent} users.`);
    return alerts;
  } catch (error) {
    console.error("❌ Error fetching Visual Crossing alerts:", error);
    return [];
  }
};
