import fetch from "node-fetch";
import ResortWeatherData from "../models/resortWeatherData.model.js";
import NwsGridPoint from "../models/nwsGridPoint.model.js";
import { fetchNwsSnow } from "../externalAPI/nwsAPI.js";
import { fetchOpenMeteoSnow, isOpenMeteoEnabled } from "../externalAPI/openMeteoAPI.js";
import { runSnowBlendIngest } from "./snowBlendIngest.js";

const NWS_CONCURRENCY = 4;

function mongoNwsCache() {
  return {
    async get(resortId) {
      const doc = await NwsGridPoint.findOne({ resortId }).lean();
      if (!doc) return null;
      return {
        resortId: doc.resortId,
        lat: doc.lat,
        lon: doc.lon,
        wfo: doc.wfo,
        gridX: doc.gridX,
        gridY: doc.gridY,
        timeZone: doc.timeZone,
      };
    },
    async set(record) {
      await NwsGridPoint.updateOne(
        { resortId: record.resortId },
        { $set: record },
        { upsert: true }
      );
    },
  };
}

/**
 * Runs after the Visual Crossing ingest. Writes snowSources and blend onto
 * the stored forecast days. Does not change snow.value, uom, or lastChecked,
 * and does not call Visual Crossing.
 *
 * forecastIngestRuns from PR #62 is absent on main, so the caller logs counts.
 */
export async function runSnowBlendJob(resorts) {
  const cache = mongoNwsCache();
  return runSnowBlendIngest(resorts, {
    concurrency: NWS_CONCURRENCY,
    isOpenMeteoEnabled,
    loadWeather: (resortId) => ResortWeatherData.findOne({ resortId }).lean(),
    saveBlend: ({ resortId, forecast, attribution }) =>
      ResortWeatherData.updateOne(
        { resortId },
        {
          $set: {
            "weatherData.visualCrossing.forecast": forecast,
            "weatherData.visualCrossing.attribution": attribution,
          },
        }
      ),
    fetchNwsSnow: (args) => fetchNwsSnow({ ...args, cache, fetchImpl: fetch }),
    fetchOpenMeteo: (args) => fetchOpenMeteoSnow({ ...args, fetchImpl: fetch }),
    log: console,
  });
}

export function logSnowBlendCounts(counts) {
  console.log(
    `Snow blend: resorts=${counts.resorts} ok=${counts.ok} failed=${counts.failed} ` +
      `nwsRequests=${counts.nwsRequests} points=${counts.nwsPointsRequests} ` +
      `gridpoints=${counts.nwsGridRequests} nwsResortFailures=${counts.nwsFailed} ` +
      `openMeteoEnabled=${counts.openMeteoEnabled} openMeteoRequests=${counts.openMeteoRequests}`
  );
}
