import mongoose from "mongoose";

const { Schema, model } = mongoose;

// Define the schema
const resortWeatherDataSchema = new Schema(
  {
    resortId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Resort", // Reference to the Resort collection
      required: true,
    },
    resortName: {
      type: String,
      required: false, // Not required initially, but will be populated
    },
    weatherData: {
      visualCrossing: {
        forecast: [
          {
            validTime: { type: String, required: true }, // Forecast date
            snow: {
              value: { type: Number, default: 0 }, // Snowfall amount (default in inches)
              snowDepth: { type: Number, default: 0 }, // Snow depth (default in inches)
            },
            temperature: {
              max: { type: Number, default: null }, // Max temp (default in Fahrenheit)
              min: { type: Number, default: null }, // Min temp (default in Fahrenheit)
              avg: { type: Number, default: null }, // Avg temp (default in Fahrenheit)
            },
            wind: {
              speed: { type: Number, default: null }, // Wind speed (default in mph)
              gust: { type: Number, default: null }, // Wind gust (default in mph)
              direction: { type: Number, default: null }, // Wind direction
            },
            precipitation: {
              value: { type: Number, default: null }, // Precipitation (default in inches)
              type: { type: [String], default: [] }, // Precipitation types
              prob: { type: Number, default: null }, // Probability
            },
            humidity: { type: Number, default: null }, // Humidity percentage
            pressure: { type: Number, default: null }, // Atmospheric pressure (default in inHg)
            visibility: { type: Number, default: null }, // Visibility (default in miles)
            cloudCover: { type: Number, default: null }, // Cloud cover percentage
            uvIndex: { type: Number, default: null }, // UV Index
            conditions: { type: String, default: "Unknown" }, // Weather conditions
          },
        ],
        uom: {
          type: String,
          enum: ["metric", "standard"], // Allowed values: metric or standard
          default: "standard", // Default is standard (inches, Fahrenheit, mph)
        },
      },
    },
    lastChecked: {
      type: Date,
      default: Date.now, // Automatically set lastChecked on creation
    },
  },
  {
    timestamps: true, // Adds createdAt and updatedAt fields
    collection: "resortWeatherData", // Explicitly define the collection name
  }
);

// Index for faster queries
resortWeatherDataSchema.index({ resortId: 1 });

// Export the model
const ResortWeatherData = model("ResortWeatherData", resortWeatherDataSchema);

export default ResortWeatherData;
