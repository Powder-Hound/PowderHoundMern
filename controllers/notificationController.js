import { fetchSnowAlerts } from "../services/weatherAlertService.js";

export const triggerSnowNotifications = async (req, res) => {
  try {
    await fetchSnowAlerts();
    res
      .status(200)
      .send({ message: "Snow notifications triggered successfully." });
  } catch (error) {
    res
      .status(500)
      .send({
        message: "Error triggering notifications",
        error: error.message,
      });
  }
};
