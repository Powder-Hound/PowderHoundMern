//regionHelper.js
import mongoose from "mongoose";
import { featureSchema } from "../models/featureSchema.model.js";

/**
 * Dynamically get the model for a region.
 * Ensures models are reused and not redefined.
 * @param {string} region - The region (e.g., 'us', 'europe', 'japan').
 * @returns {mongoose.Model} - The Mongoose model for the region.
 */
export const getRegionModel = (region) => {
  const collectionMapping = {
    us: "ski_us",
    europe: "ski_europe",
    japan: "ski_japan",
  };

  const collectionName = collectionMapping[region];
  if (!collectionName) {
    throw new Error(`Invalid region specified: ${region}`);
  }

  const modelName = `Model_${region}`; // Ensure unique model names

  // Check if the model already exists
  if (mongoose.models[modelName]) {
    return mongoose.models[modelName];
  }

  // Define and cache the model if it does not exist
  return mongoose.model(modelName, featureSchema, collectionName);
};
