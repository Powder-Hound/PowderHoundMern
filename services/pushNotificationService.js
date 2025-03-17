import dotenv from "dotenv";
import path from "path";
import { Expo } from "expo-server-sdk";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

// Log the environment variable value for debugging
console.log("USE_REAL_EXPO_PUSH:", process.env.USE_REAL_EXPO_PUSH);

// Determine if we should use the real Expo push service.
// Now, if USE_REAL_EXPO_PUSH is "true", we use the real service; otherwise, we simulate.
const useRealExpoPush = process.env.USE_REAL_EXPO_PUSH === "true";
console.log("Using real Expo push service?", useRealExpoPush);

let expo;
if (useRealExpoPush) {
  // Instantiate the Expo SDK client for production use
  expo = new Expo();
}

/**
 * Production function that sends a push notification using the Expo push service.
 *
 * @param {string} pushToken - The Expo push token.
 * @param {string} title - The notification title.
 * @param {string} body - The notification message.
 * @param {object} data - Optional additional data.
 * @returns {Promise<object>} - A promise with the response.
 */
const realSendPushNotification = async (pushToken, title, body, data = {}) => {
  if (!Expo.isExpoPushToken(pushToken)) {
    throw new Error(`Push token ${pushToken} is not a valid Expo push token`);
  }

  const message = {
    to: pushToken,
    sound: "default",
    title,
    body,
    data,
  };

  try {
    // Chunk notifications for efficient delivery
    const chunks = expo.chunkPushNotifications([message]);
    for (const chunk of chunks) {
      const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
      console.log("Expo push notification ticket:", ticketChunk);
    }
    return { success: true, message: `Push notification sent to ${pushToken}` };
  } catch (error) {
    console.error("Error sending push notification:", error);
    throw error;
  }
};

/**
 * Simulated function that logs a push notification instead of sending it.
 *
 * @param {string} pushToken - The Expo push token.
 * @param {string} title - The notification title.
 * @param {string} body - The notification message.
 * @param {object} data - Optional additional data.
 * @returns {Promise<object>} - A promise with a simulated response.
 */
const simulatedSendPushNotification = async (
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
    return {
      success: true,
      message: `Simulated push notification to ${pushToken}`,
    };
  } catch (error) {
    console.error("❌ Error simulating push notification:", error);
    throw error;
  }
};

/**
 * Sends a push notification using either the real Expo push service or the simulated version,
 * based on the environment configuration.
 *
 * @param {string} pushToken - The Expo push token.
 * @param {string} title - The notification title.
 * @param {string} body - The notification message.
 * @param {object} data - Optional additional data.
 * @returns {Promise<object>} - A promise with the result.
 */
export const sendPushNotification = async (
  pushToken,
  title,
  body,
  data = {}
) => {
  console.log(
    "sendPushNotification called. Using real service?",
    useRealExpoPush
  );
  if (useRealExpoPush) {
    return realSendPushNotification(pushToken, title, body, data);
  } else {
    return simulatedSendPushNotification(pushToken, title, body, data);
  }
};
