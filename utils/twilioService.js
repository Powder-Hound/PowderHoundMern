import dotenv from "dotenv";
import path from "path";
import twilio from "twilio";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

// Ensure Twilio credentials exist before initializing the client
if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
  throw new Error("❌ Twilio credentials are missing in .env file.");
}

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

export const sendTextMessage = async (to, message) => {
  try {
    const response = await client.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to,
    });
    console.log(`📩 Text message sent to ${to}: ${response.sid}`);
    return response;
  } catch (error) {
    console.error("❌ Error sending SMS:", error.message, error.stack);
    throw error; // Rethrow so calling functions can handle the failure
  }
};
