const fs = require("fs-extra");
const path = require("path");
const connectDB = require("../db"); // Adjust path to your DB connection file
const Feature = require("../models/Feature"); // Adjust path to your model

// Path to GeoJSON file
const geojsonPath = path.join(__dirname, "../data/ski_areas.geojson");

// Configure behavior: `clear` to delete existing data, or `skip` to only add new data
const MODE = "clear"; // Options: 'clear' or 'skip'

const seedGeoJSON = async () => {
  try {
    // Connect to the database
    await connectDB();

    if (MODE === "clear") {
      console.log("Clearing existing data...");
      await Feature.deleteMany({});
      console.log("Existing data cleared.");
    }

    // Read the GeoJSON file
    const data = await fs.readFile(geojsonPath, "utf-8");
    const geojson = JSON.parse(data);

    if (MODE === "skip") {
      console.log("Checking for duplicates...");
    }

    // Insert features
    for (const feature of geojson.features) {
      const { type, properties, geometry } = feature;

      if (MODE === "skip") {
        const exists = await Feature.findOne({
          "properties.id": properties.id,
        });
        if (exists) {
          console.log(`Skipping existing feature with ID: ${properties.id}`);
          continue;
        }
      }

      const newFeature = new Feature({ type, properties, geometry });
      await newFeature.save();
      console.log(`Inserted feature with ID: ${properties.id}`);
    }

    console.log("GeoJSON data successfully seeded to MongoDB!");
    process.exit(0); // Exit with success
  } catch (err) {
    console.error("Error seeding GeoJSON data:", err.message);
    process.exit(1); // Exit with failure
  }
};

seedGeoJSON();
