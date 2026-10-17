import { CPC_814_MAPSERVER, FORECAST_HORIZON_DAYS } from "./constants.js";
import { fetchJson } from "./http.js";
import { diffCalendarDays, eachDate } from "./time.js";

// CPC does not publish inches. This stores the 8-14 day category
// (above / near / below) for precip and temperature at the resort point.
// Source verified 2026-10-17:
//   NOAA MapServer outlooks/cpc_8_14_day_outlk
//   layer 0 temperature, layer 1 precipitation
//   fields cat, prob, fcst_date, start_date, end_date
// If that service is retired, leave rows uncaptured and see the TODO below
// rather than inventing a snowfall number.

const CATEGORY_MAP = [
  ["above", "above"],
  ["below", "below"],
  ["normal", "near"],
  ["near", "near"],
  ["ec", "near"],
];

export function mapCpcCategory(cat) {
  if (cat == null) return null;
  const text = String(cat).trim().toLowerCase();
  for (const [needle, mapped] of CATEGORY_MAP) {
    if (text === needle || text.includes(needle)) return mapped;
  }
  return null;
}

export function epochToIsoDate(value) {
  if (value == null) return null;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }
  const ms = Number(value);
  if (!Number.isFinite(ms)) return null;
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

export function parseCpcAttributes(attributes) {
  if (!attributes) return null;
  return {
    category: mapCpcCategory(attributes.cat),
    prob: attributes.prob == null ? null : Number(attributes.prob),
    issuedDate: epochToIsoDate(attributes.fcst_date),
    startDate: epochToIsoDate(attributes.start_date),
    endDate: epochToIsoDate(attributes.end_date),
    fileDateMs: attributes.idp_filedate == null ? null : Number(attributes.idp_filedate),
    sourceName: attributes.idp_source || null,
  };
}

function pickFeature(features) {
  const parsed = (features || [])
    .map((feature) => parseCpcAttributes(feature.attributes || feature))
    .filter((item) => item && item.category && item.startDate && item.endDate);
  if (!parsed.length) return null;
  parsed.sort((a, b) => (b.prob ?? -1) - (a.prob ?? -1));
  return parsed[0];
}

function covers(layer, date) {
  return Boolean(layer && date >= layer.startDate && date <= layer.endDate);
}

export function buildCpcRows({ resort, timezone, tempFeatures, precipFeatures, capturedAt }) {
  const temp = pickFeature(tempFeatures);
  const precip = pickFeature(precipFeatures);
  if (!temp && !precip) return [];
  const start = [temp?.startDate, precip?.startDate].filter(Boolean).sort()[0];
  const end = [temp?.endDate, precip?.endDate].filter(Boolean).sort().at(-1);
  const issued = temp?.issuedDate || precip?.issuedDate || start;
  const fileMs = temp?.fileDateMs || precip?.fileDateMs || null;
  const runTime = fileMs ? new Date(fileMs) : new Date(`${issued}T00:00:00Z`);
  const rows = [];
  for (const validDate of eachDate(start, end)) {
    const tempOn = covers(temp, validDate);
    const precipOn = covers(precip, validDate);
    if (!tempOn && !precipOn) continue;
    const leadDays = diffCalendarDays(validDate, issued);
    if (leadDays < 0 || leadDays > FORECAST_HORIZON_DAYS) continue;
    rows.push({
      resort,
      season: "2026-27",
      source: "cpc",
      model: "cpc_8_14",
      runTime,
      initTimeSource: "provider",
      capturedAt,
      validDate,
      leadDays,
      snowfallIn: null,
      tempHighF: null,
      tempLowF: null,
      category: {
        precip: precipOn ? precip.category : null,
        precipProb: precipOn ? precip.prob : null,
        temp: tempOn ? temp.category : null,
        tempProb: tempOn ? temp.prob : null,
        periodStart: start,
        periodEnd: end,
      },
      timezone,
    });
  }
  return rows;
}

async function queryLayer(layerId, resort) {
  const params = new URLSearchParams({
    geometry: `${resort.longitude},${resort.latitude}`,
    geometryType: "esriGeometryPoint",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: "fcst_date,start_date,end_date,prob,cat,idp_filedate,idp_source",
    returnGeometry: "false",
    f: "pjson",
  });
  const url = `${CPC_814_MAPSERVER}/${layerId}/query?${params}`;
  const payload = await fetchJson(url);
  if (payload?.error) {
    // TODO: if NOAA retires cpc_8_14_day_outlk, stub category rows here
    // instead of failing the capture. Do not invent snowfall inches.
    throw new Error(
      `CPC layer ${layerId} error: ${payload.error.message || JSON.stringify(payload.error).slice(0, 160)}`
    );
  }
  return payload?.features || [];
}

export async function fetchCpcOutlook(resort, now = new Date()) {
  const [tempFeatures, precipFeatures] = await Promise.all([
    queryLayer(0, resort),
    queryLayer(1, resort),
  ]);
  return buildCpcRows({
    resort: resort.resort,
    timezone: resort.timezone,
    tempFeatures,
    precipFeatures,
    capturedAt: now,
  });
}
