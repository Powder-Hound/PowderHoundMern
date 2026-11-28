import mongoose from "mongoose";

const { Schema, model } = mongoose;

// The /points grid for a resort coordinate. It does not change between runs.
const nwsGridPointSchema = new Schema(
  {
    resortId: {
      type: Schema.Types.ObjectId,
      ref: "Resort",
      required: true,
      unique: true,
    },
    lat: { type: Number, required: true },
    lon: { type: Number, required: true },
    wfo: { type: String, required: true },
    gridX: { type: Number, required: true },
    gridY: { type: Number, required: true },
    timeZone: { type: String, required: true },
  },
  {
    timestamps: true,
    collection: "nwsGridPoints",
  }
);

export const NwsGridPoint = model("NwsGridPoint", nwsGridPointSchema);
export default NwsGridPoint;
