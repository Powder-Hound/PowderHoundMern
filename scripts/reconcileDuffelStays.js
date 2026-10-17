/**
 * Pull Duffel Stays bookings and upsert lodging_bookings.
 *
 *   ENABLE_DUFFEL_STAYS=true node scripts/reconcileDuffelStays.js
 *
 * Not scheduled. Does nothing unless ENABLE_DUFFEL_STAYS is exactly "true".
 * Does not create bookings and does not touch the alert cron.
 */

import dotenv from "dotenv";
import mongoose from "mongoose";
import { connectDB } from "../config/db.js";
import { reconcileDuffelStays } from "../utils/duffelStaysReconcile.js";
import { isDuffelStaysEnabled } from "../utils/duffelStaysService.js";

dotenv.config();

try {
  if (!isDuffelStaysEnabled()) {
    const skipped = await reconcileDuffelStays();
    console.log(JSON.stringify(skipped));
    process.exit(0);
  }
  if (!process.env.MONGODB_URI) {
    console.error("MONGODB_URI is required to reconcile lodging_bookings");
    process.exit(1);
  }
  await connectDB();
  const result = await reconcileDuffelStays();
  console.log(JSON.stringify(result));
  await mongoose.disconnect();
  process.exit(0);
} catch (error) {
  console.error(error.message);
  try {
    await mongoose.disconnect();
  } catch {
    // already closed
  }
  process.exit(1);
}
