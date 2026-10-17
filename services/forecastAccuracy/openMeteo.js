import { FORECAST_HORIZON_DAYS, OPEN_METEO_FORECAST_URL } from "./constants.js";
import { fetchJson } from "./http.js";
import { calendarDateInZone, diffCalendarDays } from "./time.js";

// Ids confirmed live against api.open-meteo.com on 2026-10-17.
// HRRR/NAM/ICON/GEM return nulls past their range; those days are dropped.
export const OPEN_METEO_MODELS = [
  "gfs_seamless",
  "ecmwf_ifs025",
  "gem_seamless",
  "icon_seamless",
  "ncep_hrrr_conus",
  "ncep_nam_conus",
];

// Open-Meteo does not return an init timestamp on the free forecast API.
// bestKnownInit is the latest cycle whose typical publish delay has elapsed.
// Delays are conservative so we do not label a cycle that is not out yet.
// ECMWF IFS 0.25 and GEM seamless long range are 00Z/12Z. The capture crons
// (12:30Z and 00:30Z) are placed so those cycles are in. Faster blends
// (GFS seamless, ICON, NAM, HRRR) may already be one cycle newer; that is
// stored per model as initTimeSource "schedule".
export const MODEL_AVAILABILITY = {
  gfs_seamless: { hours: [0, 6, 12, 18], delayHours: 5 },
  ecmwf_ifs025: { hours: [0, 12], delayHours: 10 },
  gem_seamless: { hours: [0, 12], delayHours: 6 },
  icon_seamless: { hours: [0, 6, 12, 18], delayHours: 4 },
  ncep_nam_conus: { hours: [0, 6, 12, 18], delayHours: 3 },
  ncep_hrrr_conus: { hours: "hourly", delayHours: 2 },
};

export function bestKnownInit(now, modelId) {
  const spec = MODEL_AVAILABILITY[modelId];
  if (!spec) return null;
  if (spec.hours === "hourly") {
    const delayed = new Date(now.getTime() - spec.delayHours * 3600000);
    delayed.setUTCMinutes(0, 0, 0);
    return delayed;
  }
  const start = new Date(now);
  start.setUTCMinutes(0, 0, 0);
  for (let back = 0; back < 72; back += 1) {
    const cycle = new Date(start.getTime() - back * 3600000);
    if (!spec.hours.includes(cycle.getUTCHours())) continue;
    const readyAt = cycle.getTime() + spec.delayHours * 3600000;
    if (readyAt <= now.getTime()) return cycle;
  }
  return null;
}

export function runTimesForModels(now, models = OPEN_METEO_MODELS) {
  const runTimes = {};
  for (const model of models) {
    runTimes[model] = bestKnownInit(now, model);
  }
  return runTimes;
}

export function parseOpenMeteoDaily(payload, { resort, timezone, runTimes, capturedAt }) {
  const daily = payload?.daily || {};
  const times = daily.time || [];
  const rows = [];
  for (const model of OPEN_METEO_MODELS) {
    const snow = daily[`snowfall_sum_${model}`];
    const tmax = daily[`temperature_2m_max_${model}`];
    const tmin = daily[`temperature_2m_min_${model}`];
    if (!snow && !tmax && !tmin) continue;
    const runTime = runTimes[model];
    if (!runTime) continue;
    const initDate = calendarDateInZone(runTime, timezone);
    for (let i = 0; i < times.length; i += 1) {
      const snowfallIn = numberOrNull(snow?.[i]);
      const tempHighF = numberOrNull(tmax?.[i]);
      const tempLowF = numberOrNull(tmin?.[i]);
      if (snowfallIn == null && tempHighF == null && tempLowF == null) continue;
      const validDate = times[i];
      const leadDays = diffCalendarDays(validDate, initDate);
      if (leadDays < 0 || leadDays > FORECAST_HORIZON_DAYS) continue;
      rows.push({
        resort,
        season: "2026-27",
        source: "open-meteo",
        model,
        runTime,
        initTimeSource: "schedule",
        capturedAt,
        validDate,
        leadDays,
        snowfallIn,
        tempHighF,
        tempLowF,
        category: null,
        timezone,
      });
    }
  }
  return rows;
}

function numberOrNull(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function fetchOpenMeteo(resort, now = new Date()) {
  const params = new URLSearchParams({
    latitude: String(resort.latitude),
    longitude: String(resort.longitude),
    daily: "snowfall_sum,temperature_2m_max,temperature_2m_min",
    models: OPEN_METEO_MODELS.join(","),
    forecast_days: String(FORECAST_HORIZON_DAYS),
    temperature_unit: "fahrenheit",
    precipitation_unit: "inch",
    timezone: resort.timezone,
  });
  const payload = await fetchJson(`${OPEN_METEO_FORECAST_URL}?${params}`);
  if (payload?.error || payload?.reason) {
    throw new Error(payload.reason || "Open-Meteo error");
  }
  const capturedAt = now;
  const runTimes = runTimesForModels(now);
  return parseOpenMeteoDaily(payload, {
    resort: resort.resort,
    timezone: resort.timezone,
    runTimes,
    capturedAt,
  });
}
