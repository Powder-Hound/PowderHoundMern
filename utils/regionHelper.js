import mongoose from "mongoose";

/**
 * Dynamically get the model for a region
 * @param {string} region - The region (e.g., 'us', 'europe', 'japan')
 * @returns {mongoose.Model} - The Mongoose model for the region
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

  // Check if the model already exists to avoid OverwriteModelError
  if (mongoose.models[collectionName]) {
    console.log(`Using existing model for ${collectionName}`);
    return mongoose.models[collectionName];
  }

  console.log(`Defining new model for ${collectionName}`);
  return mongoose.model(
    collectionName,
    new mongoose.Schema({}, { strict: false }),
    collectionName
  );
};
