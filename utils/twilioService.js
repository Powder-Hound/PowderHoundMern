import twilio from "twilio";

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// export const sendTextMessage = async (to, message) => {
//   try {
//     await client.messages.create({
//       body: message,
//       from: process.env.TWILIO_PHONE_NUMBER,
//       to,
//     });
//     console.log(`Text message sent to ${to}`);
//   } catch (error) {
//     console.error("Error sending SMS:", error);
//   }
// };
// this is a mock function that simulates sending an SMS
export const sendTextMessage = async (to, message) => {
  try {
    console.log(`📩 Simulating SMS to ${to}: "${message}"`);
    return { success: true, message: `Simulated SMS to ${to}` };
  } catch (error) {
    console.error("❌ Error simulating SMS:", error);
  }
};
