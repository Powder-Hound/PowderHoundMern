import { User } from "../models/users.model.js";
import { Notification } from "../models/notification.model.js";
import { getSkiAreaWeatherDataModel } from "../models/skiAreaWeatherData.model.js";
import { sendTextMessage } from "../middleware/twilioMiddleware.js";
import sgMail from "@sendgrid/mail";

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const range = [24, 48];

// Helper function to aggregate snowfall data
const aggregateSnowfallForRange = (forecast, range) => {
  const toDate = (date) => new Date(date);
  const endDate = new Date(forecast[forecast.length - 1].validTime);
  endDate.setDate(endDate.getDate() - range / 24);

  let aggregates = [];
  let i = 0;

  while (toDate(forecast[i].validTime) <= endDate) {
    let sum = 0;
    let j = i;
    let start = toDate(forecast[j].validTime);
    let end = new Date(start);
    end.setDate(end.getDate() + range / 24);

    while (toDate(forecast[j].validTime) < end && j < forecast.length) {
      sum += forecast[j].snow.value || 0; // Handle missing snowfall data
      j++;
    }

    aggregates.push({
      start: forecast[i].validTime,
      end: end.toISOString(),
      sum,
    });
    i = j;
  }
  return aggregates;
};

// Unit conversion helper
const uomConverter = (measurement, uom, convertTo) => {
  const conversions = {
    mm: { cm: 0.1, in: 0.03937 },
    cm: { mm: 10, in: 0.3937 },
    in: { mm: 25.4, cm: 2.54 },
  };
  return measurement * (conversions[uom]?.[convertTo] || 1);
};

// Compile snowfall aggregates for a ski area
const compileAggregates = (skiAreaId, weatherData) => {
  const returnAggregates = { [skiAreaId]: {} };

  for (const dataSource in weatherData) {
    returnAggregates[skiAreaId][dataSource] = {
      uom: weatherData[dataSource].uom,
    };

    range.forEach((timeRange) => {
      const aggregates = aggregateSnowfallForRange(
        weatherData[dataSource].forecast,
        timeRange
      );
      returnAggregates[skiAreaId][dataSource][timeRange] = aggregates;
    });
  }
  return returnAggregates;
};

// Check if user thresholds are met
const checkThresholds = (
  user,
  aggregates,
  thresholdValue,
  thresholdCategory
) => {
  const userRange = user.alertThreshold.snowfallPeriod;
  const skiAreaMatched = {};

  for (const skiAreaId in aggregates) {
    const sources = Object.keys(aggregates[skiAreaId]);
    skiAreaMatched[skiAreaId] = { sources: [] };

    sources.forEach((dataSource) => {
      const data = aggregates[skiAreaId][dataSource][userRange];
      const userUOM = user.alertThreshold.uom;

      const matches = data.filter((entry) => {
        const convertedSum =
          aggregates[skiAreaId][dataSource].uom !== userUOM
            ? uomConverter(
                entry.sum,
                aggregates[skiAreaId][dataSource].uom,
                userUOM
              )
            : entry.sum;
        return convertedSum >= thresholdValue;
      });

      if (matches.length > 0) {
        skiAreaMatched[skiAreaId][dataSource] = {
          thresholdMet: true,
          sourceInfo: matches,
          category: thresholdCategory,
        };
      }
    });
  }
  return skiAreaMatched;
};

// Fetch users with active notifications
const getUsers = async () => {
  try {
    return await User.find({
      $or: [
        { "notificationsActive.phone": true },
        { "notificationsActive.email": true },
      ],
    }).lean();
  } catch (error) {
    console.error("Error fetching users:", error);
  }
};

// Fetch ski area weather data
const getAllSkiAreas = async () => {
  try {
    const SkiAreaWeatherData = getSkiAreaWeatherDataModel("us"); // Example for the US
    const results = await SkiAreaWeatherData.find();
    const allAggregates = {};

    results.forEach((skiArea) => {
      allAggregates[skiArea._id] = compileAggregates(
        skiArea._id,
        skiArea.weatherData
      );
    });
    return allAggregates;
  } catch (error) {
    console.error("Error fetching ski areas:", error);
  }
};

// Send SMS notifications via Twilio
const sendSMSNotification = (number, message) => {
  try {
    sendTextMessage(number, message);
  } catch (error) {
    console.error("Error sending SMS:", error);
  }
};

// Send email notifications via SendGrid
const sendEmailNotification = (email, subject, message) => {
  try {
    sgMail.send({
      to: email,
      from: "alerts@powalert.com",
      subject,
      text: message,
    });
  } catch (error) {
    console.error("Error sending email:", error);
  }
};

// Notify users based on matched ski areas
const notifyUsers = async () => {
  const users = await getUsers();
  const skiAreas = await getAllSkiAreas();

  const usersToNotify = {};

  users.forEach((user) => {
    const matched = {};
    const unmatched = {};

    Object.keys(skiAreas).forEach((skiAreaId) => {
      if (user.resortPreference.resorts.includes(skiAreaId)) {
        matched[skiAreaId] = skiAreas[skiAreaId];
      } else {
        unmatched[skiAreaId] = skiAreas[skiAreaId];
      }
    });

    const matchedThresholds = checkThresholds(
      user,
      matched,
      user.alertThreshold.preferredResorts,
      "preferredResorts"
    );
    const unmatchedThresholds = checkThresholds(
      user,
      unmatched,
      user.alertThreshold.anyResort,
      "anyResort"
    );

    if (
      Object.keys(matchedThresholds).length ||
      Object.keys(unmatchedThresholds).length
    ) {
      usersToNotify[user._id] = { matchedThresholds, unmatchedThresholds };
    }
  });

  // Send notifications
  Object.keys(usersToNotify).forEach((userId) => {
    const user = users.find((u) => u._id.toString() === userId);

    if (user.notificationsActive.phone) {
      sendSMSNotification(
        user.phoneNumber,
        "Snowfall alert! Check your ski areas."
      );
    }
    if (user.notificationsActive.email) {
      sendEmailNotification(
        user.email,
        "Snowfall Alert",
        "Snowfall alert! Check your ski areas."
      );
    }
  });
};

export default notifyUsers;
