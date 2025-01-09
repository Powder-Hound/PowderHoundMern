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
              value: { type: Number, default: 0 }, // Snowfall amount
              snowDepth: { type: Number, default: 0 }, // Snow depth
            },
            temperature: {
              max: { type: Number, default: null }, // Maximum temperature
              min: { type: Number, default: null }, // Minimum temperature
              avg: { type: Number, default: null }, // Average temperature
            },
            wind: {
              speed: { type: Number, default: null }, // Wind speed
              gust: { type: Number, default: null }, // Wind gust
              direction: { type: Number, default: null }, // Wind direction
            },
            precipitation: {
              value: { type: Number, default: null }, // Precipitation amount
              type: { type: [String], default: [] }, // Precipitation types
              prob: { type: Number, default: null }, // Precipitation probability
            },
            humidity: { type: Number, default: null }, // Humidity percentage
            pressure: { type: Number, default: null }, // Atmospheric pressure
            visibility: { type: Number, default: null }, // Visibility in km/miles
            cloudCover: { type: Number, default: null }, // Cloud cover percentage
            uvIndex: { type: Number, default: null }, // UV Index
            conditions: { type: String, default: "Unknown" }, // Weather conditions
          },
        ],
        uom: {
          type: String,
          enum: ["metric", "inches"], // Allowed values
          default: "inches", // Default value
        },
      }, // <--- Correctly closed this object
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

// Define indexes for faster queries
resortWeatherDataSchema.index({ resortId: 1 });

// Export the model
const ResortWeatherData = model("ResortWeatherData", resortWeatherDataSchema);

export default ResortWeatherData;
