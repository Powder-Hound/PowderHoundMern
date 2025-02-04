import mongoose from "mongoose";

const { Schema } = mongoose;

// Define the schema
const resortWeatherDataSchema = new Schema(
  {
    resortId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Resort",
      required: true,
    },
    resortName: {
      type: String,
      required: false,
    },
    weatherData: {
      visualCrossing: {
        forecast: [
          {
            validTime: { type: String, required: true },
            snow: {
              value: { type: Number, default: 0 },
              snowDepth: { type: Number, default: 0 },
            },
            temperature: {
              max: { type: Number, default: null },
              min: { type: Number, default: null },
              avg: { type: Number, default: null },
            },
            wind: {
              speed: { type: Number, default: null },
              gust: { type: Number, default: null },
              direction: { type: Number, default: null },
            },
            precipitation: {
              value: { type: Number, default: null },
              type: { type: [String], default: [] },
              prob: { type: Number, default: null },
            },
            humidity: { type: Number, default: null },
            pressure: { type: Number, default: null },
            visibility: { type: Number, default: null },
            cloudCover: { type: Number, default: null },
            uvIndex: { type: Number, default: null },
            conditions: { type: String, default: "Unknown" },
          },
        ],
        uom: {
          type: String,
          enum: ["metric", "standard"],
          default: "standard",
        },
      },
    },
    lastChecked: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

resortWeatherDataSchema.index({ resortId: 1 });

/**
 * Get or create a region-specific Mongoose model
 * @param {string} region - Region name
 * @returns {mongoose.Model}
 */
export const getResortWeatherDataModel = (region) => {
  const collectionMapping = {
    us: "ski_us_weather",
    europe: "ski_europe_weather",
    japan: "ski_japan_weather",
  };

  const collectionName = collectionMapping[region];
  if (!collectionName) throw new Error(`Invalid region specified: ${region}`);

  const modelName = `${region}_ResortWeatherData`;

  if (mongoose.models[modelName]) {
    return mongoose.models[modelName];
  }

  return mongoose.model(modelName, resortWeatherDataSchema, collectionName);
};
