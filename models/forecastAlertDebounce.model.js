import mongoose from "mongoose";

const forecastAlertDebounceSchema = new mongoose.Schema(
  {
    condition: { type: String, required: true, unique: true },
    dayKey: { type: String, required: true },
    sentAt: { type: Date, required: true },
  },
  {
    timestamps: true,
    collection: "forecastAlertDebounce",
  }
);

export const ForecastAlertDebounce = mongoose.model(
  "ForecastAlertDebounce",
  forecastAlertDebounceSchema
);

export default ForecastAlertDebounce;
