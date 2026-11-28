import { fetchJsonWithRetry } from "../utils/httpRetry.js";
import { OPEN_METEO_ATTRIBUTION } from "../utils/snowBlend.js";

/**
 * Separate from Visual Crossing and NWS. ENABLE_OPEN_METEO defaults off.
 * While it is off this module returns before any fetch. The customer host
 * is the only host used when the flag is on. The free api.open-meteo.com
 * tier is non-commercial and is not called.
 */
export const OPEN_METEO_MODELS = [
  { id: "ncep_gfs_global", source: "open-meteo:gfs" },
  { id: "ncep_hrrr_conus", source: "open-meteo:hrrr" },
  { id: "ecmwf_ifs", source: "open-meteo:ecmwf" },
  { id: "icon_global", source: "open-meteo:icon" },
  { id: "cmc_gem_gdps", source: "open-meteo:gem" },
  { id: "ncep_nbm_conus", source: "open-meteo:nbm" },
];

export function isOpenMeteoEnabled(env = process.env) {
  return env.ENABLE_OPEN_METEO === "true";
}

function snowfallSeries(daily, modelId) {
  const suffixed = daily?.[`snowfall_sum_${modelId}`];
  if (Array.isArray(suffixed)) return suffixed;
  return null;
}

function seriesUnit(body, modelId) {
  const units = body?.daily_units || {};
  return units[`snowfall_sum_${modelId}`] || units.snowfall_sum || "cm";
}

export function snowfallToInches(value, unit) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return null;
  const name = String(unit || "cm").toLowerCase();
  if (name.startsWith("in")) return number;
  if (name === "mm") return number / 25.4;
  return number / 2.54;
}

export function parseOpenMeteoDaily(body, issuedAt) {
  const daily = body?.daily || {};
  const times = Array.isArray(daily.time) ? daily.time : [];
  const days = [];
  for (const model of OPEN_METEO_MODELS) {
    const series = snowfallSeries(daily, model.id);
    if (!series) continue;
    const unit = seriesUnit(body, model.id);
    series.forEach((value, index) => {
      const inches = snowfallToInches(value, unit);
      const date = times[index];
      if (inches == null || typeof date !== "string" || date.length < 10) return;
      days.push({
        date: date.slice(0, 10),
        source: model.source,
        inches,
        issuedAt,
      });
    });
  }
  return days;
}

export async function fetchOpenMeteoSnow({
  lat,
  lon,
  timeZone,
  env = process.env,
  fetchImpl = globalThis.fetch,
  sleepImpl,
  now = () => new Date(),
} = {}) {
  if (!isOpenMeteoEnabled(env)) {
    return { requests: 0, days: [], attribution: null };
  }
  const apiKey = typeof env.OPEN_METEO_API_KEY === "string" ? env.OPEN_METEO_API_KEY.trim() : "";
  if (!apiKey) {
    return {
      requests: 0,
      days: [],
      attribution: null,
      skipped: "OPEN_METEO_API_KEY unset",
    };
  }

  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    daily: "snowfall_sum",
    models: OPEN_METEO_MODELS.map((model) => model.id).join(","),
    timezone: timeZone || "auto",
    forecast_days: "7",
    apikey: apiKey,
  });
  const url = `https://customer-api.open-meteo.com/v1/forecast?${params}`;
  let requests = 0;
  const countingFetch = async (requestUrl, options) => {
    requests += 1;
    return fetchImpl(requestUrl, options);
  };
  const body = await fetchJsonWithRetry(url, {
    fetchImpl: countingFetch,
    headers: { Accept: "application/json" },
    sleepImpl,
    label: "Open-Meteo",
  });
  const issuedAt = now().toISOString();
  const days = parseOpenMeteoDaily(body, issuedAt);
  return {
    requests,
    days,
    attribution: days.length > 0 ? OPEN_METEO_ATTRIBUTION : null,
  };
}

export { OPEN_METEO_ATTRIBUTION };
