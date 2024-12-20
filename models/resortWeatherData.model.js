import mongoose from "mongoose";
const Schema = mongoose.Schema;

const resortWeatherDataSchema = new Schema({ 
  resortId: {
    type: String,
    required: true,
    unique: true
  },
  weatherData: {
    type: Object,
    required: true,
  }
});

export const ResortWeatherData = mongoose.model("ResortWeatherData", resortWeatherDataSchema);
