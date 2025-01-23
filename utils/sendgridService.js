import sgMail from "@sendgrid/mail";

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

export const sendEmail = async (to, subject, message) => {
  try {
    await sgMail.send({
      to,
      from: process.env.SENDGRID_SENDER_EMAIL,
      subject,
      text: message,
    });
    console.log(`Email sent to ${to}`);
  } catch (error) {
    console.error("Error sending email:", error);
  }
};
