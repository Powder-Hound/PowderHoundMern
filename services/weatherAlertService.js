import mongoose from "mongoose";
import { User } from "../models/users.model.js";
import { ResortWeatherData } from "../models/resortWeatherData.model.js";
import { Notification } from "../models/notification.model.js";
import { sendTextMessage } from "../utils/twilioService.js";
import { sendEmail } from "../utils/sendgridService.js";
import { AggregatedNotification } from "../models/aggregatedNotification.model.js";
import { splitAggregatedMessages } from "../utils/smsUtils.js";
import { splitAggregatedEmailMessages } from "../utils/emailUtils.js";
import { sendPushNotification } from "../services/pushNotificationService.js";
import { isPowderAlertCronEnabled } from "../utils/stormAlertGate.js";
import { StormAlertState } from "../models/stormAlertState.model.js";
import {
  buildStormMessages,
  formatStormEmailLine,
  planMorningAlert,
  stickInches,
  stormsForResort,
} from "../utils/stormRadar.js";

function forecastDays(data) {
  const forecast = data?.weatherData?.visualCrossing?.forecast;
  if (!Array.isArray(forecast)) return [];
  return forecast.map((day) => ({
    date: day.validTime,
    inches: Number(day.snow?.value) || 0,
  }));
}

async function saveStormStates(userId, nextStates) {
  for (const next of nextStates) {
    const fields = {
      resortId: next.resortId,
      stormStart: next.stormStart,
      stormEnd: next.stormEnd,
      peakDate: next.peakDate,
      peakInches: next.peakInches,
      totalInches: next.totalInches,
      leadDays: next.leadDays,
    };
    if (next.lastShownAt) fields.lastShownAt = next.lastShownAt;
    if (next.lastShownInches != null) fields.lastShownInches = next.lastShownInches;
    if (next.lastShownBand) fields.lastShownBand = next.lastShownBand;
    if (next.lastTrigger) fields.lastTrigger = next.lastTrigger;

    if (next._id) {
      await StormAlertState.updateOne({ _id: next._id }, { $set: fields });
    } else {
      await StormAlertState.create({ userId, ...fields });
    }
  }
}

export const fetchVisualCrossingAlerts = async () => {
  try {
    console.log("🚀 Fetching Visual Crossing alerts...");

    // Storm SMS stays off unless the cron env is exactly the string "true".
    if (!isPowderAlertCronEnabled()) {
      console.warn(
        "⛔ CoS lock: storm/stick SMS off (ENABLE_POWDER_ALERT_CRON !== true). No sends."
      );
      return [];
    }

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
    const now = new Date();
    let notificationsSent = 0;
    const alerts = [];

    for (const user of users) {
      console.log(`🔎 Checking user: ${user._id}`);

      if (!user.resortPreference || !Array.isArray(user.resortPreference.resorts)) {
        console.warn(`⚠️ Skipping user ${user._id} due to invalid resortPreference.`);
        continue;
      }

      const preferredResorts = user.resortPreference.resorts.map(
        (id) => new mongoose.Types.ObjectId(id)
      );
      const weatherData = await ResortWeatherData.find({
        resortId: { $in: preferredResorts },
      });

      const threshold = stickInches(user);
      const storms = [];
      for (const data of weatherData) {
        const days = forecastDays(data);
        if (!days.length) {
          console.warn(`⚠️ No forecast data for resort: ${data.resortId}`);
          continue;
        }
        storms.push(
          ...stormsForResort(
            {
              resortId: data.resortId,
              resortName: data.resortName,
              days,
            },
            threshold,
            now
          )
        );
      }

      const priorStates = await StormAlertState.find({
        userId: user._id,
        resortId: { $in: preferredResorts },
      }).lean();

      const plan = planMorningAlert(storms, priorStates, now);
      if (!plan.send) {
        try {
          await saveStormStates(user._id, plan.nextStates);
        } catch (error) {
          console.error(`❌ Error saving storm state for user ${user._id}:`, error);
        }
        continue;
      }

      const copy = buildStormMessages({
        triggered: plan.triggered,
        monitoring: plan.monitoring,
      });
      const included = [...plan.triggered, ...plan.monitoring];
      const notificationIds = [];

      for (const storm of included) {
        try {
          const notification = await Notification.findOneAndUpdate(
            {
              userId: user._id,
              resortId: storm.resortId,
              alertDate: storm.start,
            },
            {
              message: formatStormEmailLine(storm),
              expediaLinksSent: false,
              expediaLinkId: null,
              stormStart: storm.start,
              stormEnd: storm.end,
              peakInches: storm.peakInches,
              totalInches: storm.totalInches,
              leadDays: storm.leadDays,
              stormRole: storm.reason || "monitoring",
            },
            { upsert: true, new: true }
          );
          notificationIds.push(notification._id);
          alerts.push({
            userId: user._id,
            resortId: storm.resortId,
            alertDate: storm.start,
            message: copy.sms,
            role: storm.reason || "monitoring",
          });
        } catch (error) {
          console.error(`❌ Error upserting notification for user ${user._id}:`, error);
        }
      }

      console.log(`📤 SMS body for user ${user._id}:\n`, copy.sms);

      if (user.notificationsActive.phone) {
        const smsSegments = splitAggregatedMessages([copy.sms]);
        for (const segment of smsSegments) {
          try {
            await sendTextMessage(`${user.phoneNumber}`, segment);
          } catch (error) {
            console.warn(`⚠️ SMS failed for ${user.phoneNumber} segment: ${error.message}`);
          }
        }
      }

      if (user.notificationsActive.email) {
        const emailSegments = splitAggregatedEmailMessages([copy.email]);
        for (const segment of emailSegments) {
          try {
            await sendEmail(user.email, copy.pushTitle || "New PowAlerts!", segment);
          } catch (error) {
            console.warn(`⚠️ Email failed for ${user.email} segment: ${error.message}`);
          }
        }
      }

      let pushNotificationSent = false;
      if (user.notificationsActive.pushNotification && user.pushToken) {
        try {
          await sendPushNotification(user.pushToken, copy.pushTitle, copy.pushBody, {
            userId: user._id,
          });
          pushNotificationSent = true;
        } catch (error) {
          console.error(`⚠️ Push notification failed for user ${user._id}: ${error.message}`);
        }
      }

      try {
        await AggregatedNotification.create({
          userId: user._id,
          notificationIds,
          emailMessage: copy.email,
          smsMessage: copy.sms,
          pushNotificationSent,
          sentAt: now,
        });
      } catch (error) {
        console.error(`❌ Error saving aggregated notification for user ${user._id}:`, error);
      }

      try {
        await saveStormStates(user._id, plan.nextStates);
      } catch (error) {
        console.error(`❌ Error saving storm state for user ${user._id}:`, error);
      }

      notificationsSent++;
    }

    console.log(`✅ Sent notifications to ${notificationsSent} users.`);
    return alerts;
  } catch (error) {
    console.error("❌ Error fetching Visual Crossing alerts:", error);
    return [];
  }
};
