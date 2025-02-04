// Usage: node utils/resortSeeder.js
import dotenv from "dotenv";
import path from "path";
import fs from "fs-extra";
import { fileURLToPath } from "url";
import { connectDB } from "../config/db.js";
import mongoose from "mongoose";

// Emulate __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, "../.env") });

// Path to resorts JSON file
const resortsJsonPath = path.join(__dirname, "../data/resorts.json");

// Collection name for resorts
const collectionName = "resorts";

const seedResorts = async () => {
  try {
    console.log("🌍 Connecting to MongoDB...");
    await connectDB();

    // Read JSON file
    const data = await fs.readFile(resortsJsonPath, "utf-8");
    const resorts = JSON.parse(data);

    // Convert _id.$oid to ObjectId if necessary
    const formattedResorts = resorts.map((resort) => ({
      ...resort,
      _id: resort._id?.$oid
        ? new mongoose.Types.ObjectId(resort._id.$oid)
        : new mongoose.Types.ObjectId(),
    }));

    // Get MongoDB collection
    const Collection = mongoose.connection.collection(collectionName);

    // Insert data into resorts collection
    await Collection.insertMany(formattedResorts);
    console.log(
      `✅ Inserted ${formattedResorts.length} resorts into collection: ${collectionName}`
    );

    console.log("🎉 Resort data successfully seeded!");
    process.exit(0);
  } catch (err) {
    console.error("❌ Error seeding resort data:", err.message);
    process.exit(1);
  }
};

// Run the seeding function
seedResorts();
