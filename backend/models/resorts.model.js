import mongoose from 'mongoose';
const Schema = mongoose.Schema;

// Define the schema
const resortSchema = new Schema({
  // Coordinates as latitude and longitude
  coordinates: {
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true }
  },
  state: {
    type: String,
    required: true
  },
  // Pass affiliation as a list of strings
  passAffiliation: [String],
  // Travel information including airport and lodging details
  travelInfo: {
    airport: String,
    lodging: String
  },
  // Season with start and end dates
  season: {
    start: { type: Date, required: true },
    end: { type: Date, required: true }
  }
});

// Create the model
export const Resort = mongoose.model('Resort', resortSchema);