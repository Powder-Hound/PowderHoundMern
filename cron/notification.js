const cron = require("node-cron");
const { fetchSnowAlerts } = require("./services/weatherAlertService");

// Schedule snowstorm notifications every 6 hours
cron.schedule("0 */6 * * *", () => {
  console.log("Checking for snow alerts...");
  fetchSnowAlerts();
});
