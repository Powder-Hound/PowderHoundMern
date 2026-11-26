import { ACCURACY_RESORTS } from "../../config/forecastAccuracyStations.js";
import {
  AWDB_DATA_URL,
  DEFAULT_SETTLING_TOLERANCE_IN,
  DEFAULT_SNWD_COVERAGE_MIN_PCT,
  EXPECTED_HOURLY_SAMPLES,
  FORECAST_ACCURACY_SEASON,
  PARTIAL_COVERAGE_PCT,
  WARM_SNWD_MIN_F,
} from "./constants.js";
import { fetchJson } from "./http.js";
import { eachDate, yesterdayLocal } from "./time.js";

// AWDB hourly PREC and WTEQ are cumulative (water-year style), not hourly
// increments. New snow is positive SNWD change, not a SWE conversion.
// PREC/WTEQ increases are stored only as diagnostics.

export function newSnowFromSnwd(depths, toleranceIn = DEFAULT_SETTLING_TOLERANCE_IN) {
  const values = (depths || []).filter((value) => Number.isFinite(value));
  if (!values.length) return null;
  if (values.length === 1) return 0;
  let newSnow = 0;
  let peak = values[0];
  for (let i = 1; i < values.length; i += 1) {
    const gain = values[i] - peak;
    if (gain >= toleranceIn) {
      newSnow += gain;
      peak = values[i];
    }
  }
  return Math.round(newSnow * 100) / 100;
}

export function positiveCumulativeDelta(values) {
  const series = (values || []).filter((value) => Number.isFinite(value));
  if (series.length < 2) return series.length ? 0 : null;
  let sum = 0;
  for (let i = 1; i < series.length; i += 1) {
    const delta = series[i] - series[i - 1];
    if (delta > 0) sum += delta;
  }
  return Math.round(sum * 100) / 100;
}

export function parseAwdbPayload(payload) {
  const stations = new Map();
  for (const station of payload || []) {
    const elements = {};
    for (const block of station.data || []) {
      const code = block.stationElement?.elementCode;
      if (!code) continue;
      const byTime = new Map();
      for (const entry of block.values || []) {
        if (!entry || entry.value == null || entry.date == null) continue;
        const numeric = Number(entry.value);
        if (!Number.isFinite(numeric)) continue;
        byTime.set(entry.date, numeric);
      }
      elements[code] = byTime;
    }
    if (station.stationTriplet) stations.set(station.stationTriplet, elements);
  }
  return stations;
}

function elementAt(elements, code, time) {
  const value = elements?.[code]?.get(time);
  return value == null ? null : value;
}

export function rollupHourly(elements, date, toleranceIn = DEFAULT_SETTLING_TOLERANCE_IN) {
  const times = new Set();
  for (const code of ["SNWD", "WTEQ", "TOBS", "PREC"]) {
    const map = elements?.[code];
    if (!map) continue;
    for (const time of map.keys()) {
      if (String(time).startsWith(date)) times.add(time);
    }
  }
  const hourly = [...times].sort().map((time) => ({
    time: String(time).replace(" ", "T"),
    snwd: elementAt(elements, "SNWD", time),
    wteq: elementAt(elements, "WTEQ", time),
    tobs: elementAt(elements, "TOBS", time),
    prec: elementAt(elements, "PREC", time),
  }));
  const snwd = hourly.map((hour) => hour.snwd).filter((value) => value != null);
  const temps = hourly.map((hour) => hour.tobs).filter((value) => value != null);
  const coveragePct =
    Math.round((snwd.length / EXPECTED_HOURLY_SAMPLES) * 1000) / 10;
  return {
    hourly,
    newSnowIn: newSnowFromSnwd(snwd, toleranceIn),
    tempHighF: temps.length ? Math.max(...temps) : null,
    tempLowF: temps.length ? Math.min(...temps) : null,
    coveragePct,
    snwdSamples: snwd.length,
    sweIncreaseIn: positiveCumulativeDelta(hourly.map((hour) => hour.wteq).filter((v) => v != null)),
    precipIncreaseIn: positiveCumulativeDelta(hourly.map((hour) => hour.prec).filter((v) => v != null)),
  };
}

export function chooseStation(primaryPct, backupPct, minPct, fallbackEnabled) {
  if (!fallbackEnabled) return "primary";
  if (primaryPct >= minPct) return "primary";
  if (backupPct == null) return "primary";
  if (backupPct > primaryPct) return "backup";
  return "primary";
}

export function qualityFor({ resort, role, coveragePct, snwdSamples }) {
  const flags = [];
  if (!snwdSamples) flags.push("missing");
  if (role === "backup") flags.push("sparse_fallback");
  if (resort.qualityFlag) flags.push(resort.qualityFlag);
  if (snwdSamples && coveragePct < PARTIAL_COVERAGE_PCT) flags.push("partial");
  let quality = "ok";
  if (flags.includes("missing")) quality = "missing";
  else if (flags.includes("sparse_fallback")) quality = "sparse_fallback";
  else if (flags.includes("distant")) quality = "distant";
  else if (flags.includes("snwd_derived")) quality = "snwd_derived";
  else if (flags.includes("partial")) quality = "partial";
  if (!flags.length) flags.push("ok");
  return { quality, flags };
}

export function buildDailyObservation({
  resort,
  date,
  primaryElements,
  backupElements,
  capturedAt,
}) {
  const tolerance = resort.settlingToleranceIn ?? DEFAULT_SETTLING_TOLERANCE_IN;
  const minPct = resort.snwdCoverageMinPct ?? DEFAULT_SNWD_COVERAGE_MIN_PCT;
  const primaryRoll = rollupHourly(primaryElements || {}, date, tolerance);
  const canFallback = Boolean(resort.fallbackOnSparseSnwd && resort.backup);
  const backupRoll =
    canFallback && backupElements ? rollupHourly(backupElements, date, tolerance) : null;
  const role = chooseStation(
    primaryRoll.coveragePct,
    backupRoll ? backupRoll.coveragePct : null,
    minPct,
    canFallback
  );
  const used = role === "backup" && backupRoll ? backupRoll : primaryRoll;
  const station = role === "backup" ? resort.backup : resort.primary;
  const { quality, flags } = qualityFor({
    resort,
    role,
    coveragePct: used.coveragePct,
    snwdSamples: used.snwdSamples,
  });
  let newSnowIn = used.newSnowIn;
  let reportedQuality = quality;
  if (newSnowIn > 0 && used.tempLowF != null && used.tempLowF >= WARM_SNWD_MIN_F) {
    const withoutOk = flags.filter((flag) => flag !== "ok");
    withoutOk.push("warm_snwd");
    flags.splice(0, flags.length, ...withoutOk);
    if (reportedQuality === "ok") reportedQuality = "warm_snwd";
    newSnowIn = 0;
  }
  return {
    resort: resort.resort,
    season: FORECAST_ACCURACY_SEASON,
    date,
    stationTriplet: station.triplet,
    stationName: station.name,
    stationRole: role,
    newSnowIn,
    snwdIncreaseIn: used.newSnowIn,
    tempHighF: used.tempHighF,
    tempLowF: used.tempLowF,
    coveragePct: used.coveragePct,
    quality: reportedQuality,
    flags,
    method: "positive_snwd_change",
    settlingToleranceIn: tolerance,
    sweIncreaseIn: used.sweIncreaseIn,
    precipIncreaseIn: used.precipIncreaseIn,
    primaryCoveragePct: primaryRoll.coveragePct,
    backupCoveragePct: backupRoll ? backupRoll.coveragePct : null,
    timezone: resort.timezone,
    hourly: used.hourly,
    capturedAt,
  };
}

// AWDB beginDate/endDate does not return the hourly series on endDate.
// A request ending on D yields D at 00:00 only. Ask for the next date and
// keep rows whose timestamps fall on the requested local days.
export function awdbRequestEnd(end) {
  return addDaysSafe(end, 1);
}

export function dateChunks(begin, end, size = 14) {
  const chunks = [];
  let cur = begin;
  while (cur <= end) {
    const chunkEnd = addDaysSafe(cur, size - 1);
    const endDate = chunkEnd < end ? chunkEnd : end;
    chunks.push([cur, endDate]);
    cur = addDaysSafe(endDate, 1);
    if (chunks.length > 40) break;
  }
  return chunks;
}

function addDaysSafe(isoDate, days) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function mergeStationMaps(into, from) {
  for (const [triplet, elements] of from) {
    if (!into.has(triplet)) into.set(triplet, {});
    const dest = into.get(triplet);
    for (const [code, map] of Object.entries(elements)) {
      if (!dest[code]) dest[code] = new Map();
      for (const [time, value] of map) dest[code].set(time, value);
    }
  }
  return into;
}

export async function fetchAwdbHourly({ triplets, beginDate, endDate }) {
  const params = new URLSearchParams({
    stationTriplets: triplets.join(","),
    elements: "SNWD,WTEQ,TOBS,PREC",
    duration: "HOURLY",
    beginDate,
    endDate,
  });
  const payload = await fetchJson(`${AWDB_DATA_URL}?${params}`);
  return parseAwdbPayload(payload);
}

async function fetchTriplets(triplets, begin, end, errors) {
  if (!triplets.length) return new Map();
  try {
    const merged = new Map();
    for (const [chunkBegin, chunkEnd] of dateChunks(begin, end, 14)) {
      const chunk = await fetchAwdbHourly({
        triplets,
        beginDate: chunkBegin,
        endDate: awdbRequestEnd(chunkEnd),
      });
      mergeStationMaps(merged, chunk);
    }
    return merged;
  } catch (batchError) {
    if (triplets.length === 1) {
      errors.push({ triplet: triplets[0], message: batchError.message });
      return new Map();
    }
    const merged = new Map();
    for (const triplet of triplets) {
      try {
        for (const [chunkBegin, chunkEnd] of dateChunks(begin, end, 14)) {
          const chunk = await fetchAwdbHourly({
            triplets: [triplet],
            beginDate: chunkBegin,
            endDate: awdbRequestEnd(chunkEnd),
          });
          mergeStationMaps(merged, chunk);
        }
      } catch (err) {
        errors.push({ triplet, message: err.message });
      }
    }
    return merged;
  }
}

export async function pullSnotel({
  resorts = ACCURACY_RESORTS,
  beginDate = null,
  endDate = null,
  now = new Date(),
} = {}) {
  const observations = [];
  const errors = [];
  const groups = new Map();
  for (const resort of resorts) {
    const begin = beginDate || yesterdayLocal(resort.timezone, now);
    const end = endDate || begin;
    if (begin > end) {
      errors.push({ resort: resort.resort, message: `begin ${begin} is after end ${end}` });
      continue;
    }
    const key = `${begin}|${end}`;
    if (!groups.has(key)) groups.set(key, { begin, end, resorts: [] });
    groups.get(key).resorts.push(resort);
  }

  for (const group of groups.values()) {
    const primaryTriplets = [...new Set(group.resorts.map((resort) => resort.primary.triplet))];
    const primaryData = await fetchTriplets(primaryTriplets, group.begin, group.end, errors);
    const backupResorts = group.resorts.filter(
      (resort) => resort.fallbackOnSparseSnwd && resort.backup
    );
    const backupTriplets = [...new Set(backupResorts.map((resort) => resort.backup.triplet))];
    const backupData = await fetchTriplets(backupTriplets, group.begin, group.end, errors);

    for (const resort of group.resorts) {
      const primaryElements = primaryData.get(resort.primary.triplet) || {};
      const backupElements = resort.backup ? backupData.get(resort.backup.triplet) || {} : null;
      for (const date of eachDate(group.begin, group.end)) {
        observations.push(
          buildDailyObservation({
            resort,
            date,
            primaryElements,
            backupElements,
            capturedAt: now,
          })
        );
      }
    }
  }

  return { observations, errors };
}
