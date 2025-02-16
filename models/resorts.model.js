import mongoose from "mongoose";

const Schema = mongoose.Schema;

const resortSchema = new Schema({
  resortName: { type: String, required: true },
  State: { type: String, required: true },
  City: { type: String, required: true },
  Website: { type: String },
  snowStick: { type: String },
  Latitude: { type: Number, required: true },
  Longitude: { type: Number, required: true },
  Ikon: { type: Boolean },
  Epic: { type: Boolean },
  Indy: { type: Boolean },
  "Mountain Collective": { type: Boolean },
  Country: { type: String },
  Image: { type: String },
  travelInfo: {
    airport: String,
    lodging: String,
  },
  season: {
    start: { type: Date },
    end: { type: Date },
  },
});

// Create a virtual property 'expediaLink' to populate ExpediaLink data
resortSchema.virtual("expediaLink", {
  ref: "ExpediaLink", // The model to use
  localField: "_id", // Find expedia links where 'resortId' equals '_id'
  foreignField: "resortId", // The field in ExpediaLink that relates to Resort
  justOne: true, // Return a single document rather than an array
});

// Ensure virtual fields are included when converting documents to objects/JSON
resortSchema.set("toObject", { virtuals: true });
resortSchema.set("toJSON", { virtuals: true });

export const Resort = mongoose.model("Resort", resortSchema, "resorts");
