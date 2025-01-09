import mongoose from "mongoose";
const Schema = mongoose.Schema;

// Define the schema
const resortSchema = new Schema({
  resortName: {
    type: String,
    required: true,
  },
  State: {
    type: String,
    required: true,
  },
  City: {
    type: String,
    required: true,
  },
  Website: {
    type: String,
    required: false,
  },
  snowStick: {
    type: String,
    required: false,
  },
  Latitude: { type: Number, required: true },
  Longitude: { type: Number, required: true },

  // Pass affiliation as a list of strings
  passAffiliation: {
    Ikon: { type: Boolean },
    Epic: { type: Boolean },
    Indy: { type: Boolean },
    MountainCollective: { type: Boolean },
  },
  // Travel information including airport and lodging details
  travelInfo: {
    airport: String,
    lodging: String,
  },
  // Season with start and end dates
  season: {
    start: { type: Date },
    end: { type: Date },
  },
});

// Create the model
export const Resort = mongoose.model("Resort", resortSchema, "resorts");
