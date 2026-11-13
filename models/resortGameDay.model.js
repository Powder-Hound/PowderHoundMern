import mongoose from "mongoose";

const { Schema, model } = mongoose;

const resortGameDaySchema = new Schema(
  {
    gameId: { type: String, required: true, index: true },
    userId: { type: String, required: true },
    dayIndex: { type: Number, required: true },
    date: { type: String, required: true },
    decisions: { type: Schema.Types.Mixed, required: true },
    result: { type: Schema.Types.Mixed, required: true },
  },
  {
    timestamps: true,
    collection: "resortGameDays",
  }
);

resortGameDaySchema.index({ gameId: 1, dayIndex: 1 }, { unique: true });

export const ResortGameDay = model("ResortGameDay", resortGameDaySchema);
export default ResortGameDay;
