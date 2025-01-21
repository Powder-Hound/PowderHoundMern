const mongoose = require("mongoose");

const FeatureSchema = new mongoose.Schema({
  type: { type: String },
  properties: {
    activities: [String],
    generated: Boolean,
    id: String,
    location: {
      iso3166_1Alpha2: String,
      iso3166_2: String,
      localized: {
        en: {
          country: String,
          region: String,
          locality: String,
        },
      },
    },
    name: String,
    runConvention: String,
    sources: [
      {
        type: String,
        id: String,
      },
    ],
    status: String,
    type: String,
    websites: [String],
    statistics: {
      runs: {
        byActivity: {
          nordic: {
            byDifficulty: {
              novice: {
                count: Number,
                lengthInKm: Number,
                minElevation: Number,
                maxElevation: Number,
                combinedElevationChange: Number,
              },
              easy: {
                count: Number,
                lengthInKm: Number,
                minElevation: Number,
                maxElevation: Number,
                combinedElevationChange: Number,
              },
              other: {
                count: Number,
                lengthInKm: Number,
                minElevation: Number,
                maxElevation: Number,
                combinedElevationChange: Number,
              },
            },
          },
        },
        minElevation: Number,
        maxElevation: Number,
      },
      lifts: {
        byType: mongoose.Schema.Types.Mixed,
      },
    },
  },
  geometry: {
    coordinates: [Number],
    type: String,
  },
});

module.exports = mongoose.model("Feature", FeatureSchema);
