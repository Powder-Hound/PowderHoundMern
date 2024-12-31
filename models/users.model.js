import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  permissions: {
    type: String,
    enum: ["user", "admin"],
    default: "user",
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  password: {
    type: String,
    required: false,
  },
  areaCode: {
    type: Number,
    required: true,
    default: 1,
  },
  phoneNumber: {
    type: String,
    required: true,
    unique: true,
  },
  phoneVerifySID: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: false,
    default: "",
  },
  notificationsActive: {
    phone: {
      type: Boolean,
      default: true,
    },
    email: {
      type: Boolean,
      default: false,
    },
  },
  resortPreference: {
    skiPass: {
      Ikon: { type: Boolean, default: false },
      Epic: { type: Boolean, default: false },
      Indy: { type: Boolean, default: false },
      MountainCollective: { type: Boolean, default: false },
    },
    resorts: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Resort",
      },
    ],
    lodging: {
      slopeside: {
        type: Boolean,
        required: false,
      },
      luxury: {
        type: Boolean,
        required: false,
      },
      budget: {
        type: Boolean,
        required: false,
      },
      value: {
        type: Boolean,
        required: false,
      },
    },
  },
  activityPreference: {
    skiing: { type: Boolean, default: false },
    snowboarding: { type: Boolean, default: false },
  },
  alertThreshold: {
    preferredResorts: { type: Number, default: 12 },
    anyResort: { type: Number, default: 18 },
    snowfallPeriod: {
      type: Number,
      enum: [24, 48],
      default: 48,
    },
    uom: {
      type: String,
      enum: ["cm", "mm", "in"],
      default: "in",
    },
  },
  signupSteps: {
    init: { type: Boolean, default: true },
    chooseResort: { type: Boolean, default: false },
    setParams: { type: Boolean, default: false },
    notifications: { type: Boolean, default: false },
    lodging: { type: Boolean, default: false },
    allSet: { type: Boolean, default: false },
  },
});

export const User = mongoose.model("User", userSchema);
