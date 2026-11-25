import dotenv from "dotenv";
import twilio from "twilio";
import sgMail from "@sendgrid/mail";
import { e164Phone } from "../utils/phone.js";
import { createValidatePhoneNumber } from "../utils/phoneLookupGate.js";

dotenv.config();

if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
  throw new Error("❌ Twilio credentials are missing in the .env file");
}

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const twilioErrorBody = (error, fallbackMessage) => ({
  success: false,
  message: error?.message || fallbackMessage,
  code: error?.code,
});

export const sendVerificationCode = async (req, res) => {
  try {
    const to = e164Phone(req.body?.phoneNumber);
    if (!to) {
      return res.status(400).send({
        success: false,
        message: "phoneNumber is required",
      });
    }

    const verification = await client.verify.v2
      .services(process.env.TWILIO_VERIFY_SERVICE_SID)
      .verifications.create({ to, channel: "sms" });

    return res.status(200).send({
      success: true,
      sid: verification.sid,
      status: verification.status,
    });
  } catch (e) {
    console.log(e);
    const status = e?.status && Number(e.status) >= 400 ? Number(e.status) : 500;
    return res.status(status).send(twilioErrorBody(e, "Failed to send verification code"));
  }
};

export const verifyOTP = async (req, res) => {
  try {
    const to = e164Phone(req.body?.phoneNumber);
    const code = req.body?.code ?? req.body?.otp;
    if (!to || !code) {
      return res.status(400).send({
        success: false,
        message: "phoneNumber and code are required",
      });
    }

    const check = await client.verify.v2
      .services(process.env.TWILIO_VERIFY_SERVICE_SID)
      .verificationChecks.create({ to, code });

    return res.status(200).send(check);
  } catch (error) {
    console.log(error);
    const status =
      error?.status && Number(error.status) >= 400 ? Number(error.status) : 400;
    return res.status(status).send(twilioErrorBody(error, "OTP verification failed"));
  }
};

export const sendTextMessage = (number, message) => {
  try {
    client.messages.create({
      body: message,
      to: e164Phone(number) || number,
      from: process.env.TWILIO_PHONE_NUMBER || "+18554267058",
    });
  } catch (error) {
    console.log("❌ Error sending SMS:", error);
  }
};

export const validatePhoneNumber = createValidatePhoneNumber((to) =>
  client.lookups.v2.phoneNumbers(to).fetch()
);

export const sendVerificationEmail = async (req, res) => {
  try {
    const verification = await client.verify.v2
      .services(process.env.TWILIO_VERIFY_SERVICE_SID)
      .verifications.create({
        channel: "email",
        channelConfiguration: {
          template_id: "d-93502069b6154914be398a69cec69aa2",
          from: "sign-in@powalert.com",
          from_name: "PowAlert Sign In",
        },
        to: `${req.body.email}`,
      });
    res.status(200).send(verification.sid);
  } catch (error) {
    console.log(error);
    res.status(500).send(twilioErrorBody(error, "Failed to send verification email"));
    return;
  }
};

export const emailVerificationCheck = async (req, res) => {
  try {
    const verificationCheck = await client.verify.v2
      .services(process.env.TWILIO_VERIFY_SERVICE_SID)
      .verificationChecks.create({
        code: req.body.code,
        to: req.body.email,
      });
    res.status(200).send(verificationCheck);
  } catch (error) {
    res.status(500).send(twilioErrorBody(error, "Email OTP verification failed"));
    console.error(error);
  }
};
