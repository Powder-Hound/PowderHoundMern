import { User } from "../models/users.model.js";
import { getResortWeatherDataModel } from "../models/resortWeatherData.model.js";
import { Notification } from "../models/notification.model.js";
import { sendTextMessage } from "../utils/twilioService.js";
import { sendEmail } from "../utils/sendgridService.js";

export const fetchSnowAlerts = async () => {
  try {
    // Fetch all users with active notifications (phone or email enabled)
    const users = await User.find({
      $or: [
        { "notificationsActive.phone": true },
        { "notificationsActive.email": true },
      ],
    });

    for (const user of users) {
      const region = "us"; // Example: Replace with user's region if applicable
      const ResortWeatherData = getResortWeatherDataModel(region);

      // Fetch weather data for user's preferred resorts
      const preferredResorts = user.resortPreference.resorts;
      const weatherData = await ResortWeatherData.find({
        resortId: { $in: preferredResorts },
      });

      // Check snow levels against user thresholds
      for (const data of weatherData) {
        const { forecast } = data.weatherData.visualCrossing;

        // Calculate total snowfall in the user’s selected period
        const snowfall = forecast
          .slice(0, user.alertThreshold.snowfallPeriod / 24) // E.g., 48h -> 2 days
          .reduce((total, day) => total + day.snow.value, 0);

        if (snowfall >= user.alertThreshold.preferredResorts) {
          // Create a notification message
          const message = `Snow alert! ${snowfall} inches of snow expected at ${data.resortName}.`;

          // Determine notification method (SMS or Email)
          if (
            user.notificationsActive.phone &&
            !user.notificationsActive.email
          ) {
            await sendTextMessage(
              `+${user.areaCode}${user.phoneNumber}`,
              message
            );
          } else if (
            user.notificationsActive.email &&
            !user.notificationsActive.phone
          ) {
            await sendEmail(user.email, "Snow Alert", message);
          }

          // Log notification
          await Notification.create({
            userId: user._id,
            resortId: data.resortId,
            message,
          });
        }
      }
    }
  } catch (error) {
    console.error("Error fetching snow alerts:", error);
  }
};
