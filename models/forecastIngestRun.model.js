import mongoose from "mongoose";

const forecastIngestRunSchema = new mongoose.Schema(
  {
    startedAt: { type: Date, required: true },
    finishedAt: { type: Date, required: true },
    total: { type: Number, required: true },
    ok: { type: Number, required: true },
    failed: { type: Number, required: true },
    failedIds: { type: [String], default: [] },
    errorSamples: { type: [String], default: [] },
  },
  {
    timestamps: true,
    collection: "forecastIngestRuns",
  }
);

forecastIngestRunSchema.index({ finishedAt: -1 });

export const ForecastIngestRun = mongoose.model(
  "ForecastIngestRun",
  forecastIngestRunSchema
);

export default ForecastIngestRun;
