import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

/**
 * Simulates sending a push notification.
 *
 * @param {string} pushToken - The Expo push token.
 * @param {string} title - The title of the notification.
 * @param {string} body - The body message of the notification.
 * @param {object} data - Additional data to include with the notification.
 * @returns {Promise<object>} - A simulated response indicating success.
 */
export const sendPushNotification = async (
  pushToken,
  title,
  body,
  data = {}
) => {
  try {
    console.log(`📲 Simulating push notification to ${pushToken}`);
    console.log(`Title: "${title}"`);
    console.log(`Body: "${body}"`);
    console.log("Data:", data);
    // Simulate a successful response:
    return {
      success: true,
      message: `Simulated push notification to ${pushToken}`,
    };
  } catch (error) {
    console.error("❌ Error simulating push notification:", error);
    throw error;
  }
};
