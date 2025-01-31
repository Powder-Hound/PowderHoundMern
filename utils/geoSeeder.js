// Usage: node utils/geoSeeder.js
import dotenv from "dotenv";
import path from "path";
import fs from "fs-extra";
import { fileURLToPath } from "url";
import { connectDB } from "../config/db.js";
import { getCountryModel } from "./getCountryModel.js"; // Updated for country-based storage

// Emulate __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env file
dotenv.config({ path: path.join(__dirname, "../.env") });

// Path to GeoJSON file
const geojsonPath = path.join(__dirname, "../data/ski_areas.geojson");

const seedGeoJSON = async () => {
  try {
    console.log("🚀 Connecting to MongoDB...");
    await connectDB();

    // Read and parse GeoJSON file
    const data = await fs.readFile(geojsonPath, "utf-8");
    const geojson = JSON.parse(data);

    let totalSkiAreas = 0;
    let insertedCount = 0;
    let skippedNoCoords = 0;
    let skippedNoCountry = 0;

    for (const feature of geojson.features) {
      totalSkiAreas++;

      const { properties, geometry } = feature;

      if (!properties || typeof properties !== "object") {
        console.warn("⚠️ Skipping feature due to missing properties:", feature);
        continue;
      }

      const country = properties.location?.localized?.en?.country;
      if (!country || typeof country !== "string") {
        skippedNoCountry++;
        console.warn("⚠️ Skipping feature due to missing country:", properties);
        continue;
      }

      const CountryModel = getCountryModel(country);
      if (!CountryModel) {
        console.warn(
          `⚠️ No valid CountryModel found for country: ${country}, skipping.`
        );
        continue;
      }

      // ✅ Extract Latitude & Longitude properly
      let latitude = null;
      let longitude = null;

      if (geometry?.type === "Point" && Array.isArray(geometry.coordinates)) {
        [longitude, latitude] = geometry.coordinates; // GeoJSON uses [lng, lat]
      }

      if (latitude === null || longitude === null) {
        skippedNoCoords++;
        console.warn(
          `⚠️ Skipping ${properties.name} - Missing Latitude/Longitude`
        );
        continue;
      }

      // ✅ Transform GeoJSON data to match schema
      const newFeature = {
        resortName: properties.name || "Unnamed Ski Area",
        type: properties.type || "skiArea",
        State: properties.location?.localized?.en?.region || null,
        City: properties.location?.localized?.en?.locality || null,
        Website: properties.websites || [],
        snowStick: properties.snowStick || null,
        Latitude: latitude, // ✅ Properly mapped
        Longitude: longitude, // ✅ Properly mapped
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
        country, // ✅ Store country name explicitly
        geometry, // ✅ Keep GeoJSON structure
      };

      try {
        await CountryModel.create(newFeature);
        insertedCount++;
        console.log(`✅ Inserted: ${newFeature.resortName}`);
      } catch (err) {
        console.error(`❌ Error inserting: ${err.message}`);
      }
    }

    console.log(`🎉 GeoJSON data successfully seeded to MongoDB!`);
    console.log(`📊 Summary:`);
    console.log(`  - Total Ski Areas Processed: ${totalSkiAreas}`);
    console.log(`  - Inserted: ${insertedCount}`);
    console.log(`  - Skipped (No Country): ${skippedNoCountry}`);
    console.log(`  - Skipped (No Coordinates): ${skippedNoCoords}`);

    process.exit(0);
  } catch (err) {
    console.error("❌ Error seeding GeoJSON data:", err.message);
    process.exit(1);
  }
};

seedGeoJSON();
