import mongoose from "mongoose";

const Schema = mongoose.Schema;

/**
 * Per-user memory of one storm. Optional display fields stay unset until
 * the storm is included in a sent alert. Existing notification documents
 * are a separate collection and are not rewritten.
 */
const stormAlertStateSchema = new Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    resortId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Resort",
      required: true,
    },
    stormStart: { type: Date, required: true },
    stormEnd: { type: Date, required: true },
    peakDate: { type: Date },
    peakInches: { type: Number },
    totalInches: { type: Number },
    leadDays: { type: Number },
    lastShownAt: { type: Date },
    lastShownInches: { type: Number },
    lastShownBand: {
      type: String,
      enum: ["early_watch", "plan", "lock_in"],
    },
    lastTrigger: {
      type: String,
      enum: ["new", "checkpoint", "upgrade"],
    },
  },
  {
    timestamps: true,
    collection: "stormAlertStates",
  }
);

stormAlertStateSchema.index({ userId: 1, resortId: 1, stormStart: 1 });

export const StormAlertState = mongoose.model(
  "StormAlertState",
  stormAlertStateSchema
);
