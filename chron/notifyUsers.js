import { User } from "../models/users.model.js";
import { ResortWeatherData } from "../models/resortWeatherData.model.js";
import { NotifyData } from "../models/notify.model.js";
import { sendTextMessage } from "../middleware/twilioMiddleware.js";
import client from "../middleware/postmarkMiddleware.js";

const range = [24, 48];

// Define Ski Regions including Alaska
const skiRegions = {
  Rockies: ["resort1", "resort2", "resort3"],
  "Sierra Nevada": ["resort4", "resort5"],
  Northeast: ["resort6", "resort7", "resort12", "resort13"],
  "Pacific Northwest": ["resort8", "resort9"],
  Midwest: ["resort10", "resort11"],
  Alaska: ["resort14", "resort15"],
};

// Aggregate snowfall for a given range
const aggregateSnowfallForRange = (forecast, range) => {
  const toDate = (date) => new Date(date);

  let endDate = new Date(forecast[forecast.length - 1]?.validTime);
  endDate.setDate(endDate.getDate() - range / 24);

  let aggregates = [];
  let i = 0;

  while (toDate(forecast[i]?.validTime) <= endDate) {
    let sum = 0;
    let j = i;

    const start = toDate(forecast[j]?.validTime);
    const end = new Date(start);
    end.setDate(end.getDate() + range / 24);

    while (toDate(forecast[j]?.validTime) < end) {
      sum += forecast[j]?.value || 0;
      j++;
    }

    aggregates.push({
      start: forecast[i].validTime,
      end: end.toISOString(),
      sum: sum,
    });

    i++;
  }

  return aggregates;
};

// Unit conversion
const uomConverter = (measurement, uom, convertTo) => {
  const conversionRates = {
    mm: { cm: 0.1, in: 1 / 25.4 },
    cm: { mm: 10, in: 1 / 2.54 },
    in: { mm: 25.4, cm: 2.54 },
  };
  return measurement * (conversionRates[uom]?.[convertTo] || 1);
};

// Compile aggregates by region
const compileAggregatesByRegion = (weatherData) => {
  const aggregatesByRegion = {};

  Object.entries(skiRegions).forEach(([region, resortIds]) => {
    aggregatesByRegion[region] = {};

    resortIds.forEach((resortId) => {
      const resortWeather = weatherData.find((r) => r.resortId === resortId);
      if (resortWeather) {
        aggregatesByRegion[region][resortId] = compileAggregates(
          resortId,
          resortWeather.weatherData
        );
      }
    });
  });

  return aggregatesByRegion;
};

const compileAggregates = (resortId, weatherData) => {
  const returnAggregates = { [resortId]: {} };

  for (const dataSource in weatherData) {
    returnAggregates[resortId][dataSource] = {
      uom: weatherData[dataSource].uom,
    };

    range.forEach((hours) => {
      const rangeTitle = hours.toString();
      returnAggregates[resortId][dataSource][rangeTitle] =
        aggregateSnowfallForRange(
          weatherData[dataSource].forecast.forecast,
          hours
        );
    });
  }
  return returnAggregates;
};

// Main checkResorts function
export const checkResorts = async () => {
  console.time("Execution Time");

  const previousData = await getPreviousResults();
  const weatherData = await ResortWeatherData.find({});
  const allAggregatesByRegion = compileAggregatesByRegion(weatherData);
  const allUsers = await getUsers();

  usersToNotify = {};

  allUsers.forEach((user) => {
    Object.keys(allAggregatesByRegion).forEach((region) => {
      compileUserInfo(
        user,
        allAggregatesByRegion[region],
        "preferredResorts",
        region
      );
      compileUserInfo(user, allAggregatesByRegion[region], "anyResort", region);
    });
  });

  checkForChanges(usersToNotify, previousData);

  console.timeEnd("Execution Time");
  console.log("Users to notify:", Object.keys(usersToNotify).length);

  sendUserNotifications(usersToNotify);

  for (const userId in usersToNotify) {
    await pushResults(userId, usersToNotify[userId].resorts);
  }

  return usersToNotify;
};

const compileUserInfo = (user, aggregates, userThreshold, region) => {
  const thresholdValue = user.alertThreshold[userThreshold];
  const thresholdChecked = checkThresholds(
    user,
    aggregates,
    thresholdValue,
    userThreshold
  );

  if (thresholdChecked.length > 0) {
    if (!usersToNotify[user._id]) {
      usersToNotify[user._id] = {
        username: user.username,
        regions: {},
        resorts: {},
        notificationPref: user.notificationsActive,
      };
    }

    usersToNotify[user._id].resorts[userThreshold] = thresholdChecked;
    usersToNotify[user._id].regions[region] = thresholdChecked;
  }
};

const sendUserNotifications = (usersToNotify) => {
  Object.values(usersToNotify).forEach((user) => {
    const regionNames = Object.keys(user.regions).join(", ");
    let message = `Hello, ${user.username}! Snowfall thresholds met in these regions: ${regionNames}. Ready to hit the slopes!`;

    if (user.notificationPref.phone) sendTextMessage(user.phoneNumber, message);
    if (user.notificationPref.email) {
      client.sendEmail({
        From: "sudo@powalert.com",
        To: user.email,
        Subject: "Snowfall Alert!",
        TextBody: message,
      });
    }
  });
  console.log("Notifications sent.");
};

const getUsers = async () => {
  return User.aggregate([
    {
      $match: {
        $or: [
          { "notificationsActive.phone": true },
          { "notificationsActive.email": true },
        ],
      },
    },
  ]);
};

const getPreviousResults = async () => {
  return NotifyData.find({}, { userId: 1, previousMatches: 1 });
};

const pushResults = async (userId, userResorts) => {
  await NotifyData.findOneAndUpdate(
    { userId },
    { $set: { previousMatches: userResorts } },
    { upsert: true, new: true }
  );
};

const checkForChanges = (usersToNotify, previousData) => {
  previousData.forEach((previousUser) => {
    const userId = previousUser.userId;

    if (usersToNotify[userId]) {
      if (
        JSON.stringify(previousUser.previousMatches) ===
        JSON.stringify(usersToNotify[userId].resorts)
      ) {
        delete usersToNotify[userId];
      }
    }
  });
};
