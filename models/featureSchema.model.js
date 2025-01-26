//featureSchema.js
import mongoose from "mongoose";
const Schema = mongoose.Schema;

// Define the schema for ski areas
export const featureSchema = new Schema({
  resortName: { type: String, required: true },
  type: { type: String, required: true, enum: ["skiArea"] },
  State: { type: String },
  City: { type: String },
  Website: { type: [String] },
  snowStick: { type: String },
  Latitude: { type: Number, required: true },
  Longitude: { type: Number, required: true },
  passAffiliation: {
    Ikon: { type: Boolean, default: false },
    Epic: { type: Boolean, default: false },
    Indy: { type: Boolean, default: false },
    MountainCollective: { type: Boolean, default: false },
  },
  travelInfo: {
    airport: { type: String },
    lodging: { type: String },
  },
  season: {
    start: { type: Date },
    end: { type: Date },
  },
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
    lifts: { byType: mongoose.Schema.Types.Mixed },
  },
  sources: [
    {
      type: { type: String },
      id: { type: String },
    },
  ],
  location: {
    iso3166_1Alpha2: { type: String },
    iso3166_2: { type: String },
    localized: {
      en: {
        country: { type: String },
        region: { type: String },
        locality: { type: String },
      },
    },
  },
});
