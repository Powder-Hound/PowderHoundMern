import { selectIngestCoordinates } from "./forecastPoint.js";
import { isUnitedStates } from "./nwsSnow.js";
import { applyBlendToForecast, POWALERT_SLR_SOURCE } from "./snowBlend.js";

function safeError(error) {
  return String(error?.message || error).replace(/apikey=[^&\s]+/gi, "apikey=redacted");
}

async function mapPool(items, limit, fn) {
  if (!items.length) return;
  const workers = Math.max(1, Math.min(limit, items.length));
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await fn(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: workers }, () => worker()));
}

function pushExtra(extras, date, observation) {
  if (!date) return;
  const list = extras.get(date) || [];
  list.push(observation);
  extras.set(date, list);
}

async function blendResort(resort, deps, counts) {
  const weather = await deps.loadWeather(resort.resortId);
  const forecast = weather?.weatherData?.visualCrossing?.forecast;
  if (!Array.isArray(forecast) || forecast.length === 0) {
    throw new Error("no stored Visual Crossing forecast");
  }
  const uom = weather.weatherData?.visualCrossing?.uom || "metric";
  const vcIssuedAt = weather.lastChecked
    ? new Date(weather.lastChecked).toISOString()
    : new Date().toISOString();
  const point = selectIngestCoordinates(resort);
  const extras = new Map();
  const windowsByDate = new Map();
  let timeZone = null;
  const includePowalertSlr = deps.includePowalertSlr?.() === true;

  if (isUnitedStates(resort.Country)) {
    try {
      const nws = await deps.fetchNwsSnow({
        resortId: resort.resortId,
        lat: point.lat,
        lon: point.lon,
        counts,
      });
      timeZone = nws?.timeZone || null;
      const issuedAt = nws?.issuedAt || new Date().toISOString();
      for (const day of nws?.days || []) {
        pushExtra(extras, day.date, {
          source: "nws",
          inches: day.inches,
          issuedAt,
        });
      }
      for (const day of nws?.slrDays || []) {
        pushExtra(extras, day.date, {
          source: POWALERT_SLR_SOURCE,
          inches: day.inches,
          issuedAt,
        });
      }
      for (const window of nws?.windows || []) {
        windowsByDate.set(window.date, {
          overnight: window.overnight,
          daytime: window.daytime,
          hourly: window.hourly,
        });
      }
    } catch (error) {
      counts.nwsFailed += 1;
      deps.log?.error?.(
        `NWS failed for ${resort.resortName || resort.resortId}: ${safeError(error)}`
      );
    }
  }

  let attribution = [];
  if (deps.isOpenMeteoEnabled()) {
    try {
      const openMeteo = await deps.fetchOpenMeteo({
        lat: point.lat,
        lon: point.lon,
        timeZone,
      });
      counts.openMeteoRequests += openMeteo?.requests || 0;
      for (const day of openMeteo?.days || []) {
        pushExtra(extras, day.date, {
          source: day.source,
          inches: day.inches,
          issuedAt: day.issuedAt,
        });
      }
      if (openMeteo?.attribution && (openMeteo.days || []).length > 0) {
        attribution = [openMeteo.attribution];
      }
    } catch (error) {
      counts.openMeteoFailed += 1;
      deps.log?.error?.(
        `Open-Meteo failed for ${resort.resortName || resort.resortId}: ${safeError(error)}`
      );
    }
  }

  const nextForecast = applyBlendToForecast(forecast, {
    uom,
    vcIssuedAt,
    extrasByDate: extras,
    windowsByDate,
    includePowalertSlr,
  });
  await deps.saveBlend({
    resortId: resort.resortId,
    forecast: nextForecast,
    attribution,
  });
}

/**
 * Reads the forecast Visual Crossing already stored. Does not call Visual Crossing.
 * One resort's failure is counted and the rest of the run continues.
 */
export async function runSnowBlendIngest(resorts, deps) {
  const counts = {
    resorts: resorts.length,
    ok: 0,
    failed: 0,
    nwsRequests: 0,
    nwsPointsRequests: 0,
    nwsGridRequests: 0,
    nwsFailed: 0,
    openMeteoRequests: 0,
    openMeteoFailed: 0,
    openMeteoEnabled: Boolean(deps.isOpenMeteoEnabled()),
    powalertSlrInBlend: deps.includePowalertSlr?.() === true,
  };
  await mapPool(resorts, deps.concurrency ?? 4, async (resort) => {
    try {
      await blendResort(resort, deps, counts);
      counts.ok += 1;
    } catch (error) {
      counts.failed += 1;
      deps.log?.error?.(
        `Snow blend failed for ${resort?.resortName || resort?.resortId}: ${safeError(error)}`
      );
    }
  });
  return counts;
}
