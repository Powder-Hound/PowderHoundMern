import mongoose from "mongoose";

export const getRegionModel = (region) => {
  const collectionName = {
    us: "ski_us",
    europe: "ski_europe",
    japan: "ski_japan",
  }[region];

  if (!collectionName) throw new Error(`Invalid region specified: ${region}`);

  return mongoose.model(
    collectionName,
    new mongoose.Schema({}, { strict: false }),
    collectionName
  );
};
