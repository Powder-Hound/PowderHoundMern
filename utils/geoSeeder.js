import dotenv from "dotenv";
import path from "path";
import fs from "fs-extra";
import { fileURLToPath } from "url";
import { connectDB } from "../config/db.js";
import mongoose from "mongoose";

// Emulate __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env file
dotenv.config({ path: path.join(__dirname, "../.env") });

// Path to GeoJSON file
const geojsonPath = path.join(__dirname, "../data/ski_areas.geojson");

// Database models for each region
const RegionModels = {
  UnitedStates: mongoose.model(
    "UnitedStates",
    new mongoose.Schema({}, { strict: false }),
    "ski_us"
  ),
  EuropeAllies: mongoose.model(
    "EuropeAllies",
    new mongoose.Schema({}, { strict: false }),
    "ski_europe"
  ),
  Japan: mongoose.model(
    "Japan",
    new mongoose.Schema({}, { strict: false }),
    "ski_japan"
  ),
};

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

      // Determine target collection based on country
      let regionModel = null;
      if (country === "United States") {
        regionModel = RegionModels.UnitedStates;
      } else if (
        ["France", "Germany", "United Kingdom", "Italy"].includes(country)
      ) {
        regionModel = RegionModels.EuropeAllies;
      } else if (country === "Japan") {
        regionModel = RegionModels.Japan;
      }

      // Skip if the region is not applicable
      if (!regionModel) continue;

      // Prepare the document for insertion
      const newFeature = {
        name: properties.name || "Unnamed Ski Area",
        type: properties.type || "skiArea",
        Latitude: geometry.coordinates[1],
        Longitude: geometry.coordinates[0],
        location: properties.location || {},
        statistics: properties.statistics || {},
        geometry,
      };

      try {
        await regionModel.create(newFeature);
        console.log(
          `Inserted feature in ${regionModel.collection.collectionName}: ${
            properties.name || "Unnamed Ski Area"
          }`
        );
      } catch (err) {
        console.error(`Error inserting feature: ${err.message}`);
      }
    }

    console.log("GeoJSON data successfully sharded and seeded to MongoDB!");
    process.exit(0);
  } catch (err) {
    console.error("Error seeding GeoJSON data:", err.message);
    process.exit(1);
  }
};

seedGeoJSON();
