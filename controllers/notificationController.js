const { fetchSnowAlerts } = require("../services/weatherAlertService");

// @desc    Trigger Snowstorm Notifications
exports.triggerSnowNotifications = async (req, res) => {
  try {
    await fetchSnowAlerts();
    res
      .status(200)
      .send({ message: "Snowstorm notifications triggered successfully" });
  } catch (error) {
    res.status(500).send({
      message: "Error triggering notifications",
      error: error.message,
    });
  }
};
