import mongoose from "mongoose";

/**
 * Server-side proof that Twilio Verify approved this phone.
 * First approval wins so a re-verify cannot move the timestamp
 * into the contest window. Not a second users collection.
 */
const phoneOtpVerificationSchema = new mongoose.Schema(
  {
    phoneNumber: {
      type: String,
      required: true,
      unique: true,
    },
    verifiedAt: {
      type: Date,
      required: true,
    },
  },
  { timestamps: false }
);

export const PhoneOtpVerification = mongoose.model(
  "PhoneOtpVerification",
  phoneOtpVerificationSchema,
  "phoneOtpVerifications"
);
