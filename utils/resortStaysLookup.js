import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import { resortNameToSlug } from "./segmentPredicates.js";

let fileCache;

function loadFileResorts() {
  if (!fileCache) {
    const file = join(dirname(fileURLToPath(import.meta.url)), "../data/resorts.json");
    fileCache = JSON.parse(readFileSync(file, "utf8"));
  }
  return fileCache;
}

function toStayResort(row) {
  if (!row) return null;
  const latitude = Number(row.Latitude ?? row.latitude);
  const longitude = Number(row.Longitude ?? row.longitude);
  return {
    slug: resortNameToSlug(row.resortName || row.name || ""),
    resortName: row.resortName || row.name || "",
    latitude: Number.isFinite(latitude) ? latitude : null,
    longitude: Number.isFinite(longitude) ? longitude : null,
  };
}

export async function findResortForStays(slug, { findResort, readResorts } = {}) {
  const normalized = resortNameToSlug(slug);
  if (!normalized) return null;

  if (findResort) {
    const injected = await findResort(normalized);
    return injected ? toStayResort({ ...injected, resortName: injected.resortName || normalized }) : null;
  }

  if (mongoose.connection.readyState === 1) {
    const { Resort } = await import("../models/resorts.model.js");
    const rows = await Resort.find({}, { resortName: 1, Latitude: 1, Longitude: 1 }).lean();
    const match = rows.find((row) => resortNameToSlug(row.resortName) === normalized);
    if (match) return toStayResort(match);
  }

  const rows = readResorts ? await readResorts() : loadFileResorts();
  const match = rows.find((row) => resortNameToSlug(row.resortName) === normalized);
  return toStayResort(match);
}
