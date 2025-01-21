const connectDB = require("./db");
const Feature = require("./models/Feature");
const fs = require("fs");
require("dotenv").config();

const seedData = async () => {
  try {
    // Connect to the database
    await connectDB();

    // Read the dataset
    const data = JSON.parse(fs.readFileSync("dataset.json", "utf-8"));

    // Insert data into the database
    const features = data.features.map((feature) => ({
      type: feature.type,
      properties: feature.properties,
      geometry: feature.geometry,
    }));

    await Feature.insertMany(features);
    console.log("Data successfully seeded!");

    process.exit(0); // Exit with success
  } catch (err) {
    console.error(err.message);
    process.exit(1); // Exit with failure
  }
};

seedData();
