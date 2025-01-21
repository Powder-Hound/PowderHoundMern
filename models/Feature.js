import mongoose from "mongoose";
const Schema = mongoose.Schema;

// Updated schema for ski-areas (Feature model)
const featureSchema = new Schema({
  resortName: {
    type: String,
    required: true,
  },
  type: {
    type: String,
    required: true,
    enum: ["skiArea"], // Specific to ski areas
  },
  State: {
    type: String, // Added from the Resort model
    required: false,
  },
  City: {
    type: String, // Added from the Resort model
    required: false,
  },
  Website: {
    type: [String], // Updated to accommodate multiple websites
    required: false,
  },
  snowStick: {
    type: String, // Added from the Resort model
    required: false,
  },
  Latitude: {
    type: Number,
    required: true,
  },
  Longitude: {
    type: Number,
    required: true,
  },
  passAffiliation: {
    Ikon: { type: Boolean, default: false },
    Epic: { type: Boolean, default: false },
    Indy: { type: Boolean, default: false },
    MountainCollective: { type: Boolean, default: false },
  },
  travelInfo: {
    airport: { type: String, required: false },
    lodging: { type: String, required: false },
  },
  season: {
    start: { type: Date, required: false },
    end: { type: Date, required: false },
  },
  // Fields specific to ski areas
  statistics: {
    runs: {
      byActivity: {
        nordic: {
          byDifficulty: {
            novice: {
              count: { type: Number, default: 0 },
              lengthInKm: { type: Number, default: 0 },
              minElevation: { type: Number, default: 0 },
              maxElevation: { type: Number, default: 0 },
              combinedElevationChange: { type: Number, default: 0 },
            },
            easy: {
              count: { type: Number, default: 0 },
              lengthInKm: { type: Number, default: 0 },
              minElevation: { type: Number, default: 0 },
              maxElevation: { type: Number, default: 0 },
              combinedElevationChange: { type: Number, default: 0 },
            },
            other: {
              count: { type: Number, default: 0 },
              lengthInKm: { type: Number, default: 0 },
              minElevation: { type: Number, default: 0 },
              maxElevation: { type: Number, default: 0 },
              combinedElevationChange: { type: Number, default: 0 },
            },
          },
        },
      },
      minElevation: { type: Number, default: 0 },
      maxElevation: { type: Number, default: 0 },
    },
    lifts: {
      byType: mongoose.Schema.Types.Mixed, // Preserved from ski-areas
    },
  },
  sources: [
    {
      type: { type: String, required: false },
      id: { type: String, required: false },
    },
  ],
  location: {
    iso3166_1Alpha2: { type: String, required: false },
    iso3166_2: { type: String, required: false },
    localized: {
      en: {
        country: { type: String, required: false },
        region: { type: String, required: false },
        locality: { type: String, required: false },
      },
    },
  },
});

export const Feature = mongoose.model("Feature", featureSchema, "ski-areas");
