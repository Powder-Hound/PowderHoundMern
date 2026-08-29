import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    permissions: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
      required: true,
    },
    name: {
      type: String,
      required: false,
      default: "",
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
    zipCode: {
      type: String,
      required: false, // Optional field
      default: "", // Default value if not provided
      validate: {
        validator: function (v) {
          return v === "" || /^\d{5}(-\d{4})?$/.test(v);
          // Allows empty string or valid zip code formats (e.g., 12345 or 12345-6789)
        },
        message: (props) => `${props.value} is not a valid zip code!`,
      },
    },

    pushToken: {
      type: String,
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
      pushNotification: {
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
          default: false,
        },
        luxury: {
          type: Boolean,
          default: false,
        },
        budget: {
          type: Boolean,
          default: false,
        },
        value: {
          type: Boolean,
          default: false,
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
        default: 24,
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
    lastLoggedIn: {
      type: Date,
      default: null,
    },

    // One Extra Storm — existing `users` collection only (no second table).
    // refCode is omitted until a finished /go persist; sparse unique avoids
    // colliding empty strings on last-season rows.
    refCode: {
      type: String,
      required: false,
      unique: true,
      sparse: true,
    },
    referredBy: {
      type: String,
      required: false,
      default: "",
    },
    entries: {
      type: Number,
      required: false,
      default: 0,
    },
    referredCompleteCount: {
      type: Number,
      required: false,
      default: 0,
    },
    ipHash: {
      type: String,
      required: false,
      default: "",
    },
    fraudFlag: {
      type: Boolean,
      required: false,
      default: false,
    },
    fraudReasons: {
      type: [String],
      required: false,
      default: [],
    },
    referralCredited: {
      type: Boolean,
      required: false,
      default: false,
    },
    // true only on createUser (new phone). Last-season rows stay false.
    referralCreditEligible: {
      type: Boolean,
      required: false,
      default: false,
    },
  },
  {
    timestamps: true, // Adds createdAt and updatedAt fields automatically
  }
);

// Last-season collection. Do not add a second users table.
export const User = mongoose.model("User", userSchema, "users");
