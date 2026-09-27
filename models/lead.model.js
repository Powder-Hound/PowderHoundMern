import mongoose from "mongoose";
import { LEAD_GUIDE_SLUGS } from "../utils/guideContent.js";

const shortText = (max) => ({
  type: String,
  default: "",
  maxlength: max,
  trim: true,
});

const leadSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      maxlength: 320,
    },
    name: shortText(80),
    phone: shortText(20),
    guide: {
      type: String,
      required: true,
      enum: LEAD_GUIDE_SLUGS,
    },
    utm_source: shortText(200),
    utm_medium: shortText(200),
    utm_campaign: shortText(200),
    utm_term: shortText(200),
    utm_content: shortText(200),
    ref: shortText(64),
    consent: {
      type: Boolean,
      required: true,
      default: false,
    },
    consentAt: {
      type: Date,
      default: null,
    },
    ipHash: shortText(64),
    userAgent: shortText(512),
    // Internal send bookkeeping. Not part of the HTTP response.
    emailStatus: {
      type: String,
      enum: ["pending", "sent", "failed"],
      default: "pending",
    },
    emailError: shortText(300),
  },
  { timestamps: true }
);

leadSchema.index({ email: 1, guide: 1, createdAt: -1 });

export const Lead = mongoose.model("Lead", leadSchema, "leads");
