import mongoose from "mongoose";
import { User } from "../models/users.model.js";
import { ResortWeatherData } from "../models/resortWeatherData.model.js";
import { Notification } from "../models/notification.model.js";
import { ExpediaLink } from "../models/expediaLink.model.js";
import { sendTextMessage } from "../utils/twilioService.js";
import { sendEmail } from "../utils/sendgridService.js";
import { AggregatedNotification } from "../models/aggregatedNotification.model.js";
import { buildPowderAlertSms, splitAggregatedMessages } from "../utils/smsUtils.js";
import { splitAggregatedEmailMessages } from "../utils/emailUtils.js";
import { sendPushNotification } from "../services/pushNotificationService.js";

export const fetchVisualCrossingAlerts = async () => {
  try {
    console.log("🚀 Fetching Visual Crossing alerts...");

    // Fetch users who have notifications enabled, including pushToken
    const users = await User.find(
      {
        $or: [
          { "notificationsActive.phone": true },
          { "notificationsActive.email": true },
          { "notificationsActive.pushNotification": true },
        ],
      },
      "resortPreference notificationsActive alertThreshold areaCode phoneNumber email pushToken"
    );

    if (!users.length) {
      console.log("⚠️ No users have active notifications.");
      return [];
    }

    console.log(`📌 Found ${users.length} users to check for alerts.`);
    let notificationsSent = 0;
    let alerts = [];

    // Define a group of greeting messages to randomize
    const greetings = [
      "Hello PowAlert Enthusiast,",
      "Hi there, snow lover!",
      "Greetings from PowAlert!",
      "Hey there, ready for fresh powder?",
      "Good day, winter warrior!",
    ];

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

      // Array to accumulate alert objects for this user
      let userAlerts = [];
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

            // Add the alert object to the user's alert list, storing the Expedia link if available.
            const alertObj = {
              resortId: data.resortId,
              resortName: data.resortName,
              snowfall,
              alertDate,
              message,
              expediaLink:
                expediaData && expediaData.links && expediaData.links.length > 0
                  ? expediaData.links[0]
                  : null,
            };
            userAlerts.push(alertObj);

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
        // Sort alerts so that the resort with the highest snowfall comes first
        userAlerts.sort((a, b) => b.snowfall - a.snowfall);
        const topAlert = userAlerts[0];

        // Create a standout header featuring the top alert and add a Book Now line if available
        const topAlertHeader =
          `❄️ PowAlert Extravaganza! ${topAlert.resortName} is forecasting a massive ${topAlert.snowfall}in of fresh powder!` +
          (topAlert.expediaLink
            ? `\n🏨 Book Now! --> ${topAlert.expediaLink}`
            : "");

        // Randomize the greeting from the list of greetings
        const greeting =
          greetings[Math.floor(Math.random() * greetings.length)];

        // Divider to separate sections
        const divider = "\n----------------------\n";

        // Build the detailed message:
        // 1. Greeting
        // 2. Top Alert section with header and top alert message
        // 3. Additional alerts (if any)
        // 4. Concluding dashboard call-to-action
        let messageBody = `${greeting}\n\n🔥 Top Alert:\n${topAlertHeader}${divider}${topAlert.message}\n`;
        if (userAlerts.length > 1) {
          messageBody += "\nHere are more updates for you:\n";
          userAlerts.slice(1).forEach((alert) => {
            messageBody += `• ${alert.message}\n`;
          });
        }

        const dashboardCall =
          "\nFor more live weather updates, check your PowAlert Dashboard --> https://powalert.com/\nHappy slopes!";
        const finalMessage = `${messageBody}${dashboardCall}`;
        const smsBody = buildPowderAlertSms(userAlerts);

        console.log(
          `📤 Sending combined notification to user ${user._id}:\n`,
          finalMessage
        );
        console.log(`📤 SMS body for user ${user._id}:\n`, smsBody);

        // Prepare final message array for splitting utilities
        const finalMessageArray = [finalMessage];

        // Send SMS if the user has phone notifications enabled.
        // One aggregated Twilio send per user per run; splitAggregatedMessages is safety only.
        const formattedPhoneNumber = `${user.phoneNumber}`;
        if (user.notificationsActive.phone) {
          const smsSegments = splitAggregatedMessages([smsBody]);
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
          const emailSegments = splitAggregatedEmailMessages(finalMessageArray);
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

        // Send Push Notification if the user has push notifications enabled and a valid pushToken
        let pushNotificationSent = false;
        if (user.notificationsActive.pushNotification && user.pushToken) {
          console.log(
            "Attempting push notification for user",
            user._id,
            "with pushToken:",
            user.pushToken
          );
          const pushTitle = "PowAlert Update";
          const pushBody = `New snowfall alert at ${topAlert.resortName}: ${topAlert.snowfall}in. Tap for details.`;
          try {
            await sendPushNotification(user.pushToken, pushTitle, pushBody, {
              userId: user._id,
            });
            pushNotificationSent = true;
            console.log(
              "Push notification successfully sent for user",
              user._id
            );
          } catch (error) {
            console.error(
              `⚠️ Push notification failed for user ${user._id}: ${error.message}`
            );
          }
        } else {
          console.warn(
            `Push notification conditions not met for user ${user._id}. notificationsActive.pushNotification=${user.notificationsActive.pushNotification}, pushToken=${user.pushToken}`
          );
        }

        // Save the aggregated notification record,
        // capturing both the full email copy, SMS copy, and push notification status.
        try {
          await AggregatedNotification.create({
            userId: user._id,
            notificationIds: userNotificationIds,
            emailMessage: finalMessage,
            smsMessage: smsBody,
            pushNotificationSent,
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
