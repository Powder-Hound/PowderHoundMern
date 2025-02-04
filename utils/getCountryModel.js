import mongoose from "mongoose";
import { featureSchema } from "../models/featureSchema.model.js";

/**
 * Dynamically get the Mongoose model for a country.
 * @param {string} country - The country name.
 * @returns {mongoose.Model} - The Mongoose model for the country.
 */
export const getCountryModel = (country) => {
  const collectionName = `ski_areas_${country
    .replace(/\s+/g, "_")
    .toLowerCase()}`; // Normalize country name

  const modelName = `Model_${country.replace(/\s+/g, "_").toLowerCase()}`; // Unique model name

  // Check if the model is already registered
  if (mongoose.models[modelName]) {
    return mongoose.models[modelName];
  }

  // Create a new model if it doesn't exist
  return mongoose.model(modelName, featureSchema, collectionName);
};
