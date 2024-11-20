import mongoose from "mongoose";
const Schema = mongoose.Schema;

const notifyDataSchema = new Schema({ 
    userId: {
        type: String,
        required: true,
        unique: true
    },
    previousMatches: {
        type: Object,
        required: true
    }
})

export const NotifyData = mongoose.model("NotifyData", notifyDataSchema);