import mongoose from "mongoose";
const Schema = mongoose.Schema;

const resortWeatherDataSchema = new Schema({ 
  resortId: {
    type: String,
    required: true,
  },
  weatherData: {
    type: Object,
    required: true,
  }
});

export const Resort = mongoose.model("ResortWeatherData", resortWeatherDataSchema);
