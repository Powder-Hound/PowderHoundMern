import { ForecastSnapshot } from "../../models/forecastSnapshot.model.js";
import { Observation } from "../../models/observation.model.js";

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export async function upsertForecastSnapshots(rows) {
  if (!rows?.length) return { matched: 0, upserted: 0, modified: 0 };
  let matched = 0;
  let upserted = 0;
  let modified = 0;
  for (const group of chunk(rows, 500)) {
    const ops = group.map((row) => ({
      updateOne: {
        filter: {
          resort: row.resort,
          source: row.source,
          model: row.model,
          runTime: new Date(row.runTime),
          validDate: row.validDate,
        },
        update: {
          $set: {
            ...row,
            runTime: new Date(row.runTime),
            capturedAt: new Date(row.capturedAt),
          },
        },
        upsert: true,
      },
    }));
    const result = await ForecastSnapshot.bulkWrite(ops, { ordered: false });
    matched += result.matchedCount || 0;
    upserted += result.upsertedCount || 0;
    modified += result.modifiedCount || 0;
  }
  return { matched, upserted, modified };
}

export async function upsertObservations(rows) {
  if (!rows?.length) return { matched: 0, upserted: 0, modified: 0 };
  let matched = 0;
  let upserted = 0;
  let modified = 0;
  for (const group of chunk(rows, 200)) {
    const ops = group.map((row) => ({
      updateOne: {
        filter: { resort: row.resort, date: row.date },
        update: {
          $set: {
            ...row,
            capturedAt: new Date(row.capturedAt),
          },
        },
        upsert: true,
      },
    }));
    const result = await Observation.bulkWrite(ops, { ordered: false });
    matched += result.matchedCount || 0;
    upserted += result.upsertedCount || 0;
    modified += result.modifiedCount || 0;
  }
  return { matched, upserted, modified };
}
