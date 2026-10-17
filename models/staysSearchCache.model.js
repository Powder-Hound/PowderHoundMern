import mongoose from "mongoose";

const staysSearchCacheSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    payload: { type: mongoose.Schema.Types.Mixed, required: true },
    expireAt: { type: Date, required: true },
  },
  { timestamps: true }
);

staysSearchCacheSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });

export const StaysSearchCache = mongoose.model(
  "StaysSearchCache",
  staysSearchCacheSchema,
  "stays_search_cache"
);
