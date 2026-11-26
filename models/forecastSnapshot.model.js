import mongoose from "mongoose";

const { Schema, model } = mongoose;

// One quantitative or CPC-category forecast day.
// Unique on resort + source + model + runTime + validDate so a cron retry upserts.
const forecastSnapshotSchema = new Schema(
  {
    resort: { type: String, required: true },
    season: { type: String, required: true },
    source: { type: String, required: true },
    model: { type: String, required: true },
    runTime: { type: Date, required: true },
    initTimeSource: {
      type: String,
      enum: ["provider", "schedule", "capture"],
      required: true,
    },
    capturedAt: { type: Date, required: true },
    validDate: { type: String, required: true },
    leadDays: { type: Number, required: true },
    snowfallIn: { type: Number, default: null },
    tempHighF: { type: Number, default: null },
    tempLowF: { type: Number, default: null },
    category: { type: Schema.Types.Mixed, default: null },
    timezone: { type: String, required: true },
  },
  {
    timestamps: true,
    collection: "forecast_snapshots",
  }
);

forecastSnapshotSchema.index(
  { resort: 1, source: 1, model: 1, runTime: 1, validDate: 1 },
  { unique: true }
);
forecastSnapshotSchema.index({ resort: 1, validDate: 1 });

export const ForecastSnapshot =
  mongoose.models.ForecastSnapshot || model("ForecastSnapshot", forecastSnapshotSchema);

export default ForecastSnapshot;
