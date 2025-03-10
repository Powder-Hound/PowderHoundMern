import dotenv from "dotenv";
import path from "path";
import sgMail from "@sendgrid/mail";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

// Ensure SendGrid API Key is available
if (!process.env.SENDGRID_API_KEY) {
  throw new Error("❌ SENDGRID_API_KEY is missing in .env file.");
}

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// export const sendEmail = async (to, subject, message) => {
//   try {
//     const response = await sgMail.send({
//       to,
//       from: process.env.SENDGRID_SENDER_EMAIL,
//       subject,
//       text: message,
//     });
//     console.log(`📧 Email sent to ${to}:`, response);
//     return response;
//   } catch (error) {
//     console.error("❌ Error sending email:", error.message, error.stack);
//     throw error;
//   }
// };
// this is a mock function that simulates sending an email
export const sendEmail = async (to, subject, message) => {
  try {
    console.log(
      `📧 Simulating Email to ${to} | Subject: "${subject}" | Message: "${message}"`
    );
    return { success: true, message: `Simulated Email to ${to}` };
  } catch (error) {
    console.error("❌ Error simulating Email:", error);
  }
};
