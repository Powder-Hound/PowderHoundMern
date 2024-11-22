import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
    permissions: {
        type: String,
        enum: ['user', 'admin'],
        default: 'user',
        required: true
    },
    name: {
        type: String,
        required: true,
        unique: true
    },
    password: {
        type: String,
        required: false
    },
    areaCode: {
        type: Number,
        required: true,
        default: 1
    },
    phoneNumber: {
        type: String,
        required: true,
        unique: true
    },
    phoneVerifySID: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: false
    },
    notificationsActive: {
        phone: {
            type: Boolean,
            default: true,
            required: true
        },
        email: {
            type: Boolean,
            default: false,
            required: true
        }
    },
    resortPreference: {
        skiPass: {
            type: [String],
            required: false
        },
        resorts: {
            type: [String],
            required: false
        },
        lodging: {
            slopeside: {
                type: Boolean,
                required: false
            },
            luxury:  {
                type: Boolean,
                required: false
            },
            budget: {
                type: Boolean,
                required: false
            },
            value:  {
                type: Boolean,
                required: false
            },
        }
    },
    activityPreference: {
        skiing: {
            type: Boolean,
            default: false,
            required: false
        },
        snowboarding: {
            type: Boolean,
            default: false,
            required: false
        }
    },
    alertThreshold: {
        preferredResorts: {
            type: Number,
            default: 12,
            required: false
        },
        anyResort: {
            type: Number,
            default: 18,
            required: false
        },
        snowfallPeriod: {
            type: Number,
            enum: [24, 48, 72],
            default: 48,
            required: true
        },
        uom: {
            type: String,
            enum: ['cm', 'mm', 'in'],
            default: 'in',
            required: true
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