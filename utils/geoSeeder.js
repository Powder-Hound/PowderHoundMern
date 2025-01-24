// Usage: node utils/geoSeeder.js
import dotenv from "dotenv";
import path from "path";
import fs from "fs-extra";
import { fileURLToPath } from "url";
import { connectDB } from "../config/db.js";
import { getRegionModel } from "./regionHelper.js"; // Reuse dynamic model loader

// Emulate __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env file
dotenv.config({ path: path.join(__dirname, "../.env") });

// Path to GeoJSON file
const geojsonPath = path.join(__dirname, "../data/ski_areas.geojson");

const seedGeoJSON = async () => {
  try {
    console.log("Connecting to MongoDB...");
    await connectDB();

    // Read GeoJSON file
    const data = await fs.readFile(geojsonPath, "utf-8");
    const geojson = JSON.parse(data);

    for (const feature of geojson.features) {
      const { properties, geometry } = feature;
      const country = properties.location?.localized?.en?.country;

      // Determine region based on country
      let region;
      if (country === "United States") {
        region = "us";
      } else if (
        ["France", "Germany", "United Kingdom", "Italy"].includes(country)
      ) {
        region = "europe";
      } else if (country === "Japan") {
        region = "japan";
      }

      // Skip if the region is not applicable
      if (!region) {
        console.log(
          `Skipping feature: ${
            properties.name || "Unnamed Ski Area"
          } (Unknown region)`
        );
        continue;
      }

      // Get the appropriate model using the dynamic model loader
      const Model = getRegionModel(region);

      // Transform the GeoJSON data to match the schema
      const newFeature = {
        resortName: properties.name || "Unnamed Ski Area",
        type: properties.type || "skiArea",
        State: properties.location?.localized?.en?.region || null,
        City: properties.location?.localized?.en?.locality || null,
        Website: properties.websites || [],
        snowStick: properties.snowStick || null,
        Latitude: geometry.coordinates[1],
        Longitude: geometry.coordinates[0],
        passAffiliation: properties.passAffiliation || {
          Ikon: false,
          Epic: false,
          Indy: false,
          MountainCollective: false,
        },
        travelInfo: properties.travelInfo || { airport: null, lodging: null },
        season: properties.season || { start: null, end: null },
        statistics: properties.statistics || {
          runs: {
            byActivity: {
              nordic: {
                byDifficulty: {
                  novice: {
                    count: 0,
                    lengthInKm: 0,
                    minElevation: 0,
                    maxElevation: 0,
                    combinedElevationChange: 0,
                  },
                  easy: {
                    count: 0,
                    lengthInKm: 0,
                    minElevation: 0,
                    maxElevation: 0,
                    combinedElevationChange: 0,
                  },
                  other: {
                    count: 0,
                    lengthInKm: 0,
                    minElevation: 0,
                    maxElevation: 0,
                    combinedElevationChange: 0,
                  },
                },
              },
            },
            minElevation: 0,
            maxElevation: 0,
          },
          lifts: { byType: {} },
        },
        sources: properties.sources || [],
        location: properties.location || {},
        country, // Extracted country name
        geometry,
      };

      try {
        await Model.create(newFeature);
        console.log(
          `Inserted feature in ${Model.collection.collectionName}: ${
            properties.name || "Unnamed Ski Area"
          }`
        );
      } catch (err) {
        console.error(`Error inserting feature: ${err.message}`);
      }
    }

    console.log("GeoJSON data successfully seeded to MongoDB!");
    process.exit(0);
  } catch (err) {
    console.error("Error seeding GeoJSON data:", err.message);
    process.exit(1);
  }
};

seedGeoJSON();
