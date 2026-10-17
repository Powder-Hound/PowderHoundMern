import { FORECAST_HORIZON_DAYS, NWS_POINTS_URL } from "./constants.js";
import { fetchJson } from "./http.js";
import {
  addDays,
  calendarDateInZone,
  diffCalendarDays,
  eachDate,
  overlapHours,
} from "./time.js";

const NWS_HEADERS = { Accept: "application/geo+json" };

// There is no NWS client elsewhere in this repo. This module is the point
// forecast pull for the accuracy tracker only: /points → forecast + grid.
// It does not send alerts.

export function parseValidTime(validTime) {
  const [startIso, duration = ""] = String(validTime).split("/");
  const start = new Date(startIso);
  const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(duration);
  if (!match || Number.isNaN(start.getTime())) {
    return { start, end: start };
  }
  const ms =
    Number(match[1] || 0) * 86400000 +
    Number(match[2] || 0) * 3600000 +
    Number(match[3] || 0) * 60000 +
    Number(match[4] || 0) * 1000;
  return { start, end: new Date(start.getTime() + ms) };
}

export function mmToInches(mm) {
  return mm / 25.4;
}

export function cToF(celsius) {
  return (celsius * 9) / 5 + 32;
}

export function snowValueToInches(value, uom) {
  const unit = String(uom || "");
  if (/in/i.test(unit) && !/mm/i.test(unit)) return Number(value);
  return mmToInches(Number(value));
}

export function tempValueToF(value, uom) {
  const unit = String(uom || "");
  if (/degF|fahrenheit|\[degF\]/i.test(unit)) return Number(value);
  return cToF(Number(value));
}

function roundTo(value, digits) {
  if (value == null || Number.isNaN(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function sumSnowByLocalDate(values, timeZone, uom) {
  const totals = new Map();
  for (const entry of values || []) {
    if (entry?.value == null || !entry.validTime) continue;
    const { start, end } = parseValidTime(entry.validTime);
    const hours = (end.getTime() - start.getTime()) / 3600000;
    if (!Number.isFinite(hours) || hours <= 0) continue;
    const inches = snowValueToInches(entry.value, uom);
    if (!Number.isFinite(inches)) continue;
    const startDate = calendarDateInZone(start, timeZone);
    const endDate = calendarDateInZone(new Date(end.getTime() - 1), timeZone);
    for (const date of eachDate(addDays(startDate, -1), addDays(endDate, 1))) {
      const hoursInDay = overlapHours(start, end, date, timeZone);
      if (hoursInDay <= 0) continue;
      totals.set(date, (totals.get(date) || 0) + inches * (hoursInDay / hours));
    }
  }
  return totals;
}

export function tempsFromHourly(values, timeZone, uom) {
  const samples = new Map();
  for (const entry of values || []) {
    if (entry?.value == null || !entry.validTime) continue;
    const { start } = parseValidTime(entry.validTime);
    if (Number.isNaN(start.getTime())) continue;
    const date = calendarDateInZone(start, timeZone);
    const tempF = tempValueToF(entry.value, uom);
    if (!Number.isFinite(tempF)) continue;
    if (!samples.has(date)) samples.set(date, []);
    samples.get(date).push(tempF);
  }
  const out = new Map();
  for (const [date, temps] of samples) {
    out.set(date, {
      high: Math.max(...temps),
      low: Math.min(...temps),
      source: "hourly",
    });
  }
  return out;
}

function extremesTouchingDate(values, timeZone, uom) {
  const byDate = new Map();
  for (const entry of values || []) {
    if (entry?.value == null || !entry.validTime) continue;
    const { start, end } = parseValidTime(entry.validTime);
    const tempF = tempValueToF(entry.value, uom);
    if (!Number.isFinite(tempF)) continue;
    const startDate = calendarDateInZone(start, timeZone);
    const endDate = calendarDateInZone(new Date(Math.max(start.getTime(), end.getTime() - 1)), timeZone);
    for (const date of eachDate(startDate, endDate)) {
      if (!byDate.has(date)) byDate.set(date, []);
      byDate.get(date).push(tempF);
    }
  }
  return byDate;
}

export function mergeTemperatures({
  hourly,
  maxValues,
  minValues,
  periods,
  timeZone,
  hourlyUom,
  maxUom,
  minUom,
}) {
  const temps = tempsFromHourly(hourly, timeZone, hourlyUom);
  const maxByDate = extremesTouchingDate(maxValues, timeZone, maxUom);
  const minByDate = extremesTouchingDate(minValues, timeZone, minUom);
  const extremeDates = new Set([...maxByDate.keys(), ...minByDate.keys()]);
  for (const date of extremeDates) {
    if (temps.has(date)) continue;
    const highs = maxByDate.get(date) || [];
    const lows = minByDate.get(date) || [];
    temps.set(date, {
      high: highs.length ? Math.max(...highs) : null,
      low: lows.length ? Math.min(...lows) : null,
      source: "extremes",
    });
  }
  for (const period of periods || []) {
    if (!Number.isFinite(period?.temperature) || !period.startTime) continue;
    const date = calendarDateInZone(new Date(period.startTime), timeZone);
    const prev = temps.get(date) || { high: null, low: null, source: "period" };
    if (period.isDaytime) {
      if (prev.high == null) prev.high = period.temperature;
    } else if (prev.low == null) {
      prev.low = period.temperature;
    }
    if (!temps.has(date)) prev.source = "period";
    temps.set(date, prev);
  }
  return temps;
}

export function parseNwsBundle({ resort, timeZone, grid, forecast, capturedAt }) {
  const gridProps = grid?.properties || {};
  const forecastProps = forecast?.properties || {};
  const updateRaw = gridProps.updateTime || forecastProps.updateTime || null;
  const runTime = updateRaw ? new Date(updateRaw) : capturedAt;
  const initTimeSource = updateRaw ? "provider" : "capture";
  const initDate = calendarDateInZone(runTime, timeZone);
  const snow = sumSnowByLocalDate(
    gridProps.snowfallAmount?.values,
    timeZone,
    gridProps.snowfallAmount?.uom
  );
  const temps = mergeTemperatures({
    hourly: gridProps.temperature?.values,
    maxValues: gridProps.maxTemperature?.values,
    minValues: gridProps.minTemperature?.values,
    periods: forecastProps.periods,
    timeZone,
    hourlyUom: gridProps.temperature?.uom,
    maxUom: gridProps.maxTemperature?.uom,
    minUom: gridProps.minTemperature?.uom,
  });
  const dates = new Set([...snow.keys(), ...temps.keys()]);
  const rows = [];
  for (const validDate of [...dates].sort()) {
    const leadDays = diffCalendarDays(validDate, initDate);
    if (leadDays < 0 || leadDays > FORECAST_HORIZON_DAYS) continue;
    const temp = temps.get(validDate);
    const snowfallIn = snow.has(validDate) ? roundTo(snow.get(validDate), 3) : null;
    const tempHighF = temp ? roundTo(temp.high, 1) : null;
    const tempLowF = temp ? roundTo(temp.low, 1) : null;
    if (snowfallIn == null && tempHighF == null && tempLowF == null) continue;
    rows.push({
      resort,
      season: "2026-27",
      source: "nws",
      model: "nws_point",
      runTime,
      initTimeSource,
      capturedAt,
      validDate,
      leadDays,
      snowfallIn,
      tempHighF,
      tempLowF,
      category: null,
      timezone: timeZone,
    });
  }
  return rows;
}

export async function fetchNwsForecast(resort, now = new Date()) {
  const points = await fetchJson(
    `${NWS_POINTS_URL}/${resort.latitude},${resort.longitude}`,
    { headers: NWS_HEADERS }
  );
  const props = points?.properties || {};
  if (!props.forecast || !props.forecastGridData) {
    throw new Error("NWS points response missing forecast URLs");
  }
  const [grid, forecast] = await Promise.all([
    fetchJson(props.forecastGridData, { headers: NWS_HEADERS }),
    fetchJson(props.forecast, { headers: NWS_HEADERS }),
  ]);
  return parseNwsBundle({
    resort: resort.resort,
    timeZone: props.timeZone || resort.timezone,
    grid,
    forecast,
    capturedAt: now,
  });
}
