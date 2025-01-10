const axios = require("axios");
const Resort = require("../models/Resort");
const Notification = require("../models/Notification");
const User = require("../models/User");
const twilio = require("twilio");

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = twilio(accountSid, authToken);

const fetchSnowAlerts = async () => {
  try {
    // Fetch weather data from NOAA or OpenWeatherMap
    const weatherResponse = await axios.get(`WEATHER_API_URL`);
    const snowstormRegions = parseSnowData(weatherResponse.data);

    // Identify ski resorts in affected regions
    const resorts = await Resort.find({
      location: { $in: snowstormRegions },
    });

    // Find users to alert
    const users = await User.find({});

    // Create and send notifications
    users.forEach(async (user) => {
      resorts.forEach(async (resort) => {
        const message = `❄️ Snowstorm Alert! ❄️  
Heavy snowfall expected near ${resort.name}. Check available lodges here: ${resort.websiteLink}`;

        try {
          // Send SMS notification
          await client.messages.create({
            body: message,
            from: process.env.TWILIO_PHONE_NUMBER,
            to: user.phoneNumber,
          });

          // Save notification log
          await Notification.create({
            userId: user._id,
            resortId: resort._id,
            message,
            responseStatus: "sent",
          });
        } catch (error) {
          console.error("Failed to send SMS:", error.message);
          await Notification.create({
            userId: user._id,
            resortId: resort._id,
            message,
            responseStatus: "failed",
          });
        }
      });
    });

    console.log("Notifications processed successfully");
  } catch (error) {
    console.error("Error processing snow alerts:", error.message);
  }
};

// Parse relevant snowstorm data from weather API response
function parseSnowData(data) {
  const regions = [];
  // Example parsing logic for snowstorm regions
  data.forecasts.forEach((forecast) => {
    if (forecast.snowfall > 10) {
      regions.push(forecast.region);
    }
  });
  return regions;
}

module.exports = { fetchSnowAlerts };
