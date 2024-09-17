import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
    permissions: {
        type: String,
        enum: ['user', 'admin'],
        default: 'user',
        required: true
    },
    username: {
        type: String,
        required: true,
        unique: true
    },
    password: {
        type: String,
        required: true
    },
    phoneNumber: {
        type: String,
        required: true,
        unique: true
    },
    email: {
        type: String,
        required: false
    },
    resortPreference: {
        skiPass: {
            type: [String],
            required: false
        },
        resorts: {
            type: [String],
            required: false
        }
    },
    alertThreshold: {
        preferredResorts: {
            type: Number,
            default: 0
        },
        anyResort: {
            type: Number,
            default: 0
        }
    },
    travelInformation: {
        zipCode: {
            type: String,
            required: false
        },
        airport: {
            type: String,
            required: false
        }
    }
});

export const User = mongoose.model('User', userSchema);