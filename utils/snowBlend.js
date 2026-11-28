/**
 * Per-day snow observations and the published median / low / high.
 * Inches are hundredths. singleSource is true when only one observation
 * is present (Visual Crossing alone on later days, or when other sources
 * are absent).
 */

import { POWALERT_SLR_SOURCE } from "./snowRatio.js";

export { POWALERT_SLR_SOURCE };

export const OPEN_METEO_ATTRIBUTION = {
  provider: "Open-Meteo",
  license: "CC BY 4.0",
  url: "https://open-meteo.com/",
  licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
};

const SOURCE_ORDER = [
  "visualCrossing",
  "nws",
  "open-meteo:gfs",
  "open-meteo:hrrr",
  "open-meteo:ecmwf",
  "open-meteo:icon",
  "open-meteo:gem",
  "open-meteo:nbm",
  POWALERT_SLR_SOURCE,
];

/** Exactly "true" includes powalert-slr in the published median. Default off. */
export function blendIncludesPowalertSlr(env = process.env) {
  return env?.BLEND_INCLUDE_POWALERT_SLR === "true";
}

export function roundSnowInches(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.round(number * 100) / 100;
}

export function visualCrossingSnowInches(value, uom) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return null;
  const unit = String(uom || "metric").toLowerCase();
  if (
    unit === "us" ||
    unit === "standard" ||
    unit === "imperial" ||
    unit === "english"
  ) {
    return number;
  }
  return number / 2.54;
}

export function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const count = sorted.length;
  if (count === 0) return null;
  if (count % 2 === 1) return sorted[(count - 1) / 2];
  const mid = count / 2;
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

function sourceRank(source) {
  const index = SOURCE_ORDER.indexOf(source);
  return index === -1 ? SOURCE_ORDER.length : index;
}

export function buildBlend(observations, options = {}) {
  const includePowalertSlr = options.includePowalertSlr === true;
  const ordered = [...(observations || [])].sort(
    (a, b) => sourceRank(a.source) - sourceRank(b.source)
  );
  const seen = new Set();
  const snowSources = [];
  for (const observation of ordered) {
    if (!observation?.source || seen.has(observation.source)) continue;
    const inches = roundSnowInches(observation.inches);
    if (inches == null || inches < 0) continue;
    seen.add(observation.source);
    snowSources.push({
      source: observation.source,
      inches,
      issuedAt: observation.issuedAt || null,
    });
  }
  if (snowSources.length === 0) return null;
  const blendPool = includePowalertSlr
    ? snowSources
    : snowSources.filter((source) => source.source !== POWALERT_SLR_SOURCE);
  if (blendPool.length === 0) return { snowSources, blend: null };
  const values = blendPool.map((source) => source.inches);
  const count = values.length;
  return {
    snowSources,
    blend: {
      median: roundSnowInches(median(values)),
      low: Math.min(...values),
      high: Math.max(...values),
      sources: blendPool.map((source) => source.source),
      n: count,
      singleSource: count === 1,
    },
  };
}

function dayKey(validTime) {
  const text = String(validTime || "");
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : text;
}

export function applyBlendToForecast(forecast, options) {
  const {
    uom,
    vcIssuedAt,
    extrasByDate,
    windowsByDate,
    includePowalertSlr,
  } = options || {};
  return (forecast || []).map((day) => {
    const observations = [];
    const vcInches = visualCrossingSnowInches(day?.snow?.value, uom);
    if (vcInches != null) {
      observations.push({
        source: "visualCrossing",
        inches: vcInches,
        issuedAt: vcIssuedAt || null,
      });
    }
    const extras = extrasByDate?.get(dayKey(day?.validTime)) || [];
    observations.push(...extras);
    const built = buildBlend(observations, {
      includePowalertSlr: includePowalertSlr === true,
    });
    const next = built
      ? {
          ...day,
          snowSources: built.snowSources,
          ...(built.blend ? { blend: built.blend } : {}),
        }
      : { ...day };
    if (built && !built.blend) delete next.blend;
    if (windowsByDate) {
      const windows = windowsByDate.get(dayKey(day?.validTime));
      if (windows) next.nwsWindows = windows;
      else delete next.nwsWindows;
    }
    return next;
  });
}

export function attributionForForecast(forecast) {
  const used = (forecast || []).some((day) =>
    (day?.blend?.sources || []).some((source) =>
      String(source).startsWith("open-meteo:")
    )
  );
  return used ? [OPEN_METEO_ATTRIBUTION] : [];
}
