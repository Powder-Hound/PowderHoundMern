import mongoose from "mongoose";

const { Schema, model } = mongoose;

const hourlySchema = new Schema(
  {
    time: { type: String, required: true },
    snwd: { type: Number, default: null },
    wteq: { type: Number, default: null },
    tobs: { type: Number, default: null },
    prec: { type: Number, default: null },
  },
  { _id: false }
);

// Daily SNOTEL/SCAN rollup. Hourly raw is embedded (one mountain day is small).
// Unique on resort + local date so the daily job upserts.
const observationSchema = new Schema(
  {
    resort: { type: String, required: true },
    season: { type: String, required: true },
    date: { type: String, required: true },
    stationTriplet: { type: String, required: true },
    stationName: { type: String, required: true },
    stationRole: { type: String, enum: ["primary", "backup"], required: true },
    newSnowIn: { type: Number, default: null },
    snwdIncreaseIn: { type: Number, default: null },
    tempHighF: { type: Number, default: null },
    tempLowF: { type: Number, default: null },
    coveragePct: { type: Number, default: null },
    quality: { type: String, required: true },
    flags: { type: [String], default: [] },
    method: { type: String, required: true },
    settlingToleranceIn: { type: Number, required: true },
    sweIncreaseIn: { type: Number, default: null },
    precipIncreaseIn: { type: Number, default: null },
    primaryCoveragePct: { type: Number, default: null },
    backupCoveragePct: { type: Number, default: null },
    timezone: { type: String, required: true },
    hourly: { type: [hourlySchema], default: [] },
    capturedAt: { type: Date, required: true },
  },
  {
    timestamps: true,
    collection: "observations",
  }
);

observationSchema.index({ resort: 1, date: 1 }, { unique: true });

export const Observation =
  mongoose.models.Observation || model("Observation", observationSchema);

export default Observation;
