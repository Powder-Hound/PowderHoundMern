import mongoose from "mongoose";
const Schema = mongoose.Schema;

const expediaLinkSchema = new Schema(
  {
    resortId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Resort",
      required: true,
    },
    links: {
      type: [String], // Array of Expedia affiliate links
      required: true,
    },
  },
  {
    timestamps: true, // Automatically adds createdAt & updatedAt fields
  }
);

export const ExpediaLink = mongoose.model(
  "ExpediaLink",
  expediaLinkSchema,
  "expediaLinks"
);
