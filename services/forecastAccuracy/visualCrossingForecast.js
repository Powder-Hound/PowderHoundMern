import { FORECAST_HORIZON_DAYS, VISUAL_CROSSING_TIMELINE_URL } from "./constants.js";
import { fetchJson, redactSecrets } from "./http.js";
import { addDays, calendarDateInZone, captureSlot, diffCalendarDays } from "./time.js";

// Separate from externalAPI/visualCrossingAPI.js on purpose.
// That client is metric, cached, and on the weather-update path. This one
// asks for US units (inches, F) and never writes resortWeatherData.

export function parseVisualCrossingDays(payload, { resort, timezone, runTime, capturedAt }) {
  const days = payload?.days || [];
  const initDate = calendarDateInZone(runTime, timezone);
  const rows = [];
  for (const day of days) {
    if (!day?.datetime) continue;
    const validDate = String(day.datetime).slice(0, 10);
    const leadDays = diffCalendarDays(validDate, initDate);
    if (leadDays < 0 || leadDays > FORECAST_HORIZON_DAYS) continue;
    const snowfallIn = numberOrNull(day.snow);
    const tempHighF = numberOrNull(day.tempmax);
    const tempLowF = numberOrNull(day.tempmin);
    if (snowfallIn == null && tempHighF == null && tempLowF == null) continue;
    rows.push({
      resort,
      season: "2026-27",
      source: "visual-crossing",
      model: "visual_crossing",
      runTime,
      initTimeSource: "capture",
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
  return rows;
}

function numberOrNull(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function fetchVisualCrossingForecast(resort, now = new Date(), env = process.env) {
  const key = env.VISUALCROSSING_KEY;
  if (!key) {
    throw new Error("VISUALCROSSING_KEY is not set");
  }
  const start = calendarDateInZone(now, resort.timezone);
  const end = addDays(start, FORECAST_HORIZON_DAYS - 1);
  const params = new URLSearchParams({
    unitGroup: "us",
    include: "days",
    elements: "tempmax,tempmin,snow",
    contentType: "json",
    key,
  });
  const url = `${VISUAL_CROSSING_TIMELINE_URL}/${resort.latitude},${resort.longitude}/${start}/${end}?${params}`;
  let payload;
  try {
    payload = await fetchJson(url);
  } catch (err) {
    throw new Error(redactSecrets(err.message));
  }
  return parseVisualCrossingDays(payload, {
    resort: resort.resort,
    timezone: resort.timezone,
    runTime: captureSlot(now),
    capturedAt: now,
  });
}
