import mongoose from "mongoose";

const { Schema, model } = mongoose;

// Define the schema
const resortWeatherDataSchema = new Schema(
  {
    resortId: {
      type: String,
      required: true,
      unique: true, // Assuming each resortId is unique
    },
    weatherData: {
      visualCrossing: {
        forecast: {
          type: Map,
          of: {
            validTime: { type: String, required: true }, // Example of a forecast object
            value: { type: Number, default: 0 }, // Snow forecast value (default to 0)
          },
        },
        uom: { type: String, default: "cm" }, // Unit of measurement for snow
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

// Define indexes for faster queries
resortWeatherDataSchema.index({ resortId: 1 });

// Export the model
const ResortWeatherData = model("ResortWeatherData", resortWeatherDataSchema);

export default ResortWeatherData;
