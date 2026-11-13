import { E, cToF, fToC } from "./economics.config.js";

export function missingWeather(date, reason = "forecast_missing") {
  return {
    date,
    source: "missing",
    reason,
    snowfallCm: 0,
    snowDepthCm: null,
    tempMaxC: null,
    tempMinC: null,
    tempAvgC: null,
    windKmh: null,
    windGustKmh: null,
    precipMm: 0,
    precipType: [],
    humidity: null,
    rain: false,
    conditions: null,
  };
}

function finiteOrNull(value) {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Normalize one stored Visual Crossing day.
 * `uom` "metric" means °C, cm of snow, mm of precip, km/h wind (what this
 * repo requests from Visual Crossing). "standard" means °F, inches, mph.
 */
export function normalizeForecastDay(day, uom = "standard", date) {
  if (!day || typeof day !== "object") return missingWeather(date, "empty_forecast_day");
  const metric = uom === "metric";
  const snowRaw = finiteOrNull(day.snow?.value) ?? 0;
  const depthRaw = finiteOrNull(day.snow?.snowDepth);
  const toC = (value) => {
    const n = finiteOrNull(value);
    if (n == null) return null;
    return metric ? n : fToC(n);
  };
  const toCm = (value) => {
    const n = finiteOrNull(value);
    if (n == null) return null;
    return metric ? n : n * E.cmPerInch;
  };
  const toMm = (value) => {
    const n = finiteOrNull(value);
    if (n == null) return 0;
    return metric ? n : n * E.cmPerInch * E.mmPerCm;
  };
  const toKmh = (value) => {
    const n = finiteOrNull(value);
    if (n == null) return null;
    return metric ? n : n * E.kmPerMile;
  };
  const tempMaxC = toC(day.temperature?.max);
  const tempMinC = toC(day.temperature?.min);
  let tempAvgC = toC(day.temperature?.avg);
  if (tempAvgC == null && tempMaxC != null && tempMinC != null) {
    tempAvgC = (tempMaxC + tempMinC) / E.midpointDivisor;
  }
  const precipType = Array.isArray(day.precipitation?.type)
    ? day.precipitation.type.map((item) => String(item))
    : [];
  const snowfallCm = Math.max(0, toCm(snowRaw) ?? 0);
  const precipMm = Math.max(0, toMm(day.precipitation?.value) ?? 0);
  const rainType = precipType.some((item) => item.toLowerCase().includes("rain"));
  const rain =
    rainType ||
    (tempAvgC != null &&
      tempAvgC > E.freezingC &&
      precipMm > 0 &&
      snowfallCm === 0);
  const iso = date || String(day.validTime || "").slice(0, 10);
  return {
    date: iso,
    source: "forecast",
    reason: null,
    snowfallCm,
    snowDepthCm: depthRaw == null ? null : Math.max(0, toCm(depthRaw) ?? 0),
    tempMaxC,
    tempMinC,
    tempAvgC,
    windKmh: toKmh(day.wind?.speed),
    windGustKmh: toKmh(day.wind?.gust),
    precipMm,
    precipType,
    humidity: finiteOrNull(day.humidity),
    rain,
    conditions: day.conditions || null,
    uomAssumed: uom !== "metric" && uom !== "standard",
  };
}

export function syntheticDay(date, overrides = {}) {
  return {
    ...missingWeather(date, null),
    source: "fixture",
    tempMaxC: -2,
    tempMinC: -8,
    tempAvgC: -5,
    windKmh: 10,
    windGustKmh: 16,
    humidity: 60,
    conditions: "Clear",
    ...overrides,
    date,
  };
}

export function createFixtureWeatherProvider(daysByDate) {
  return async function fixtureWeather(_resortId, isoDate) {
    const raw = daysByDate[isoDate];
    if (!raw) return missingWeather(isoDate, "fixture_missing");
    if (raw.source && raw.snowfallCm != null && raw.tempAvgC !== undefined) {
      return { ...raw, date: isoDate };
    }
    return normalizeForecastDay(raw.day ?? raw, raw.uom || "metric", isoDate);
  };
}

export function createLiveWeatherProvider(ResortWeatherData) {
  return async function liveWeather(resortId, isoDate) {
    if (!ResortWeatherData || !resortId) return missingWeather(isoDate, "no_weather_model");
    let doc;
    try {
      doc = await ResortWeatherData.findOne({ resortId });
    } catch {
      return missingWeather(isoDate, "forecast_lookup_failed");
    }
    if (!doc) return missingWeather(isoDate, "no_forecast_document");
    const block = doc.weatherData?.visualCrossing;
    const days = block?.forecast || [];
    const uom = block?.uom || "standard";
    const match = days.find((day) => String(day.validTime || "").slice(0, 10) === isoDate);
    if (!match) return missingWeather(isoDate, "date_not_in_forecast");
    return normalizeForecastDay(match, uom, isoDate);
  };
}

export function kmhToMph(kmh) {
  if (kmh == null || !Number.isFinite(kmh)) return null;
  return kmh / E.kmPerMile;
}

/** Stull 2011. Returns null when humidity is missing so the caller can fall back. */
export function wetBulbCelsius(tempC, humidityPct) {
  if (tempC == null || humidityPct == null) return null;
  if (!Number.isFinite(tempC) || !Number.isFinite(humidityPct)) return null;
  const rh = humidityPct;
  const s = E.stull;
  return (
    tempC * Math.atan(s.a * Math.sqrt(rh + s.b)) +
    Math.atan(tempC + rh) -
    Math.atan(rh - s.c) +
    s.d * rh ** s.rhExponent * Math.atan(s.e * rh) -
    s.f
  );
}

export function snowmakingWindow(weather) {
  let method = "dry_bulb_min";
  let tempC = weather?.tempMinC;
  if (tempC == null) {
    tempC = weather?.tempAvgC ?? null;
    method = tempC == null ? "unknown" : "dry_bulb_avg";
  }
  if (tempC == null) {
    return {
      efficiency: 0,
      wetBulbF: null,
      method: "unknown_window_closed",
      open: false,
    };
  }
  let wetC = tempC;
  if (weather.humidity != null && method === "dry_bulb_min") {
    const wb = wetBulbCelsius(tempC, weather.humidity);
    if (wb != null) {
      wetC = wb;
      method = "stull_wet_bulb";
    }
  }
  const wetBulbF = cToF(wetC);
  let efficiency = 0;
  if (wetBulbF <= E.snowmakingEfficientF) {
    efficiency = 1;
  } else if (wetBulbF <= E.snowmakingMarginalLowF) {
    const span = E.snowmakingMarginalLowF - E.snowmakingEfficientF;
    const t = span === 0 ? 1 : (wetBulbF - E.snowmakingEfficientF) / span;
    efficiency = 1 + t * (E.snowmakingMarginalYield - 1);
  } else if (wetBulbF <= E.snowmakingShutoffF) {
    const span = E.snowmakingShutoffF - E.snowmakingMarginalLowF;
    const t = span === 0 ? 1 : (wetBulbF - E.snowmakingMarginalLowF) / span;
    efficiency = E.snowmakingMarginalYield * (1 - t);
  }
  if (!Number.isFinite(efficiency) || efficiency < 0) efficiency = 0;
  if (efficiency > 1) efficiency = 1;
  return { efficiency, wetBulbF, method, open: efficiency > 0 };
}
