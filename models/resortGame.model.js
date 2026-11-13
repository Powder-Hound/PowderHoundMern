import mongoose from "mongoose";

const { Schema, model } = mongoose;

const resortGameSchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    powalertResortId: { type: String, required: true, index: true },
    state: { type: Schema.Types.Mixed, required: true },
  },
  {
    timestamps: true,
    collection: "resortGames",
  }
);

export const ResortGame = model("ResortGame", resortGameSchema);
export default ResortGame;
