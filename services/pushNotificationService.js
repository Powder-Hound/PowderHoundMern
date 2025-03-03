import { Expo } from "expo-server-sdk";

// Create a new Expo SDK client
const expo = new Expo();

/**
 * Sends a push notification via the Expo push service.
 *
 * @param {string} pushToken - The Expo push token from the user's record.
 * @param {string} title - The title of the notification.
 * @param {string} body - The message body of the notification.
 * @param {object} data - Additional data to send with the notification (optional).
 * @returns {Promise<void>}
 */
export const sendPushNotification = async (
  pushToken,
  title,
  body,
  data = {}
) => {
  // Validate the Expo push token.
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
    // Chunk notifications for efficient delivery.
    const chunks = expo.chunkPushNotifications([message]);
    for (const chunk of chunks) {
      const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
      console.log("Expo push notification ticket:", ticketChunk);
    }
  } catch (error) {
    console.error("Error sending push notification:", error);
    throw error;
  }
};
