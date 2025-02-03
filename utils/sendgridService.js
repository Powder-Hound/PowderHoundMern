import sgMail from "@sendgrid/mail";

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// export const sendEmail = async (to, subject, message) => {
//   try {
//     await sgMail.send({
//       to,
//       from: process.env.SENDGRID_SENDER_EMAIL,
//       subject,
//       text: message,
//     });
//     console.log(`Email sent to ${to}`);
//   } catch (error) {
//     console.error("Error sending email:", error);
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
