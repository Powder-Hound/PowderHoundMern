/**
 * National Weather Service snowfall periods are ISO-8601 intervals
 * (start/duration). Sum them onto local calendar days. A period that
 * crosses local midnight is split by the share of the interval on each day.
 *
 * The same gridpoint body also carries quantitativePrecipitation and
 * temperature. Those are bucketed here into overnight (5 PM–5 AM local,
 * attributed to the morning it ends), daytime (5 AM–5 PM), and local
 * hours for days 0–3. No second NWS request is made.
 */

import { snowFromLiquid } from "./snowRatio.js";

const DURATION_RE =
  /^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/;

export function formatNwsCoordinate(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error("Invalid NWS coordinate");
  }
  return Number(number.toFixed(4));
}

export function isUnitedStates(country) {
  const value = String(country || "")
    .trim()
    .toLowerCase();
  return (
    value === "united states" ||
    value === "united states of america" ||
    value === "usa" ||
    value === "us"
  );
}

export function parseIsoDurationMs(duration) {
  if (typeof duration !== "string") return null;
  const match = DURATION_RE.exec(duration);
  if (!match) return null;
  const days = Number(match[1] || 0);
  const hours = Number(match[2] || 0);
  const minutes = Number(match[3] || 0);
  const seconds = Number(match[4] || 0);
  if (days === 0 && hours === 0 && minutes === 0 && seconds === 0) return null;
  return (((days * 24 + hours) * 60 + minutes) * 60 + seconds) * 1000;
}

export function parseValidInterval(validTime) {
  if (typeof validTime !== "string") return null;
  const slash = validTime.indexOf("/");
  if (slash <= 0) return null;
  const start = new Date(validTime.slice(0, slash));
  if (Number.isNaN(start.getTime())) return null;
  const rest = validTime.slice(slash + 1);
  if (rest.startsWith("P")) {
    const durationMs = parseIsoDurationMs(rest);
    if (durationMs == null) return null;
    return { start, end: new Date(start.getTime() + durationMs) };
  }
  const end = new Date(rest);
  if (Number.isNaN(end.getTime())) return null;
  return { start, end };
}

function part(parts, type) {
  return parts.find((entry) => entry.type === type)?.value;
}

export function localDateKey(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  return `${part(parts, "year")}-${part(parts, "month")}-${part(parts, "day")}`;
}

function timeZoneOffsetMs(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  let hour = Number(part(parts, "hour"));
  if (hour === 24) hour = 0;
  const asUtc = Date.UTC(
    Number(part(parts, "year")),
    Number(part(parts, "month")) - 1,
    Number(part(parts, "day")),
    hour,
    Number(part(parts, "minute")),
    Number(part(parts, "second"))
  );
  return asUtc - date.getTime();
}

export function zonedCivilToUtcMs(year, month, day, hour, minute, second, timeZone) {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second);
  const offset = timeZoneOffsetMs(new Date(utcGuess), timeZone);
  let utc = utcGuess - offset;
  const corrected = timeZoneOffsetMs(new Date(utc), timeZone);
  if (corrected !== offset) utc = utcGuess - corrected;
  return utc;
}

export function nextLocalMidnightMs(date, timeZone) {
  const [year, month, day] = localDateKey(date, timeZone).split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return zonedCivilToUtcMs(
    next.getUTCFullYear(),
    next.getUTCMonth() + 1,
    next.getUTCDate(),
    0,
    0,
    0,
    timeZone
  );
}

/**
 * @returns {{date: string, amount: number}[]} sums in the source unit
 */
export function bucketQuantitativeValues(values, timeZone) {
  const totals = new Map();
  for (const entry of values || []) {
    const amount = Number(entry?.value);
    if (!Number.isFinite(amount)) continue;
    const interval = parseValidInterval(entry.validTime);
    if (!interval) continue;
    const startMs = interval.start.getTime();
    const endMs = interval.end.getTime();
    const span = endMs - startMs;
    if (!(span > 0)) continue;
    let cursor = startMs;
    let guard = 0;
    while (cursor < endMs && guard < 10000) {
      guard += 1;
      const date = localDateKey(new Date(cursor), timeZone);
      const midnight = nextLocalMidnightMs(new Date(cursor), timeZone);
      const sliceEnd = Math.min(endMs, midnight);
      if (!(sliceEnd > cursor)) break;
      const share = amount * ((sliceEnd - cursor) / span);
      totals.set(date, (totals.get(date) || 0) + share);
      cursor = sliceEnd;
    }
  }
  return [...totals.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([date, amount]) => ({ date, amount }));
}

export function quantitativeToInches(amount, uom) {
  const unit = String(uom || "").toLowerCase();
  if (unit.includes("mm")) return amount / 25.4;
  if (unit.includes("cm")) return amount / 2.54;
  if (unit.includes("inch") || unit.includes("in_i")) return amount;
  if (unit.endsWith(":m") || unit === "m") return amount * 39.37007874015748;
  return null;
}

export function nwsDailyInches(snowfallAmount, timeZone) {
  const buckets = bucketQuantitativeValues(snowfallAmount?.values, timeZone);
  const inches = [];
  for (const bucket of buckets) {
    const converted = quantitativeToInches(bucket.amount, snowfallAmount?.uom);
    if (converted == null || !Number.isFinite(converted) || converted < 0) continue;
    inches.push({ date: bucket.date, amount: bucket.amount, inches: converted });
  }
  return inches;
}

export function addCalendarDays(dateKey, delta) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day + delta));
  const y = utc.getUTCFullYear();
  const m = String(utc.getUTCMonth() + 1).padStart(2, "0");
  const d = String(utc.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function localHourNumber(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    hour: "2-digit",
  }).formatToParts(date);
  let hour = Number(part(parts, "hour"));
  if (hour === 24) hour = 0;
  return hour;
}

/** Local hour starts from midnight through the next local midnight. 23, 24, or 25 on DST days. */
export function localHourStarts(dateKey, timeZone) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const start = zonedCivilToUtcMs(year, month, day, 0, 0, 0, timeZone);
  const [ny, nm, nd] = addCalendarDays(dateKey, 1).split("-").map(Number);
  const end = zonedCivilToUtcMs(ny, nm, nd, 0, 0, 0, timeZone);
  const starts = [];
  for (let t = start; t < end; t += 3600000) starts.push(t);
  return starts;
}

function hourStartContaining(ms, timeZone) {
  const key = localDateKey(new Date(ms), timeZone);
  const [year, month, day] = key.split("-").map(Number);
  const midnight = zonedCivilToUtcMs(year, month, day, 0, 0, 0, timeZone);
  const elapsed = ms - midnight;
  const steps = Math.floor(elapsed / 3600000);
  return midnight + Math.max(0, steps) * 3600000;
}

export function temperatureToFahrenheit(value, uom) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const unit = String(uom || "").toLowerCase();
  if (unit.includes("degf") || unit.includes("fahrenheit") || unit.includes("[degf]")) {
    return number;
  }
  if (unit.includes("kelvin") || /(^|:)k$/.test(unit)) {
    return ((number - 273.15) * 9) / 5 + 32;
  }
  if (!unit || unit.includes("degc") || unit.includes("celsius")) {
    return (number * 9) / 5 + 32;
  }
  return null;
}

function emptyBin(startMs, timeZone) {
  const date = new Date(startMs);
  return {
    startMs,
    date: localDateKey(date, timeZone),
    hourLocal: localHourNumber(date, timeZone),
    snow: null,
    snowMs: 0,
    qpf: null,
    qpfMs: 0,
    tempWeighted: 0,
    tempMs: 0,
  };
}

function walkInterval(startMs, endMs, timeZone, onSlice) {
  let cursor = startMs;
  let guard = 0;
  while (cursor < endMs && guard < 10000) {
    guard += 1;
    const hourStart = hourStartContaining(cursor, timeZone);
    const boundary = hourStart + 3600000;
    const sliceEnd = Math.min(endMs, boundary);
    if (!(sliceEnd > cursor)) break;
    onSlice(hourStart, cursor, sliceEnd);
    cursor = sliceEnd;
  }
}

function pourSeries(bins, values, uom, timeZone, kind, create) {
  for (const entry of values || []) {
    const interval = parseValidInterval(entry?.validTime);
    if (!interval) continue;
    const startMs = interval.start.getTime();
    const endMs = interval.end.getTime();
    const span = endMs - startMs;
    if (!(span > 0)) continue;
    const amount =
      kind === "temp"
        ? temperatureToFahrenheit(entry.value, uom)
        : (() => {
            const raw = Number(entry?.value);
            if (!Number.isFinite(raw) || raw < 0) return null;
            return quantitativeToInches(raw, uom);
          })();
    if (amount == null) continue;
    walkInterval(startMs, endMs, timeZone, (hourStart, cursor, sliceEnd) => {
      let bin = bins.get(hourStart);
      if (!bin && create) {
        bin = emptyBin(hourStart, timeZone);
        bins.set(hourStart, bin);
      }
      if (!bin) return;
      const slice = sliceEnd - cursor;
      if (kind === "temp") {
        bin.tempWeighted += amount * slice;
        bin.tempMs += slice;
        return;
      }
      const share = amount * (slice / span);
      if (kind === "snow") {
        bin.snow = (bin.snow || 0) + share;
        bin.snowMs += slice;
      } else {
        bin.qpf = (bin.qpf || 0) + share;
        bin.qpfMs += slice;
      }
    });
  }
}

function round2(value) {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.round(value * 100) / 100;
}

function round1(value) {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.round(value * 10) / 10;
}

function aggregateWindow(bins) {
  let snow = 0;
  let snowSeen = false;
  let snowMs = 0;
  let qpf = 0;
  let qpfSeen = false;
  let qpfMs = 0;
  let tempWeighted = 0;
  let tempMs = 0;
  let totalMs = 0;
  for (const bin of bins) {
    totalMs += 3600000;
    if (bin.snow != null && bin.snowMs > 0) {
      snow += bin.snow;
      snowSeen = true;
      snowMs += bin.snowMs;
    }
    if (bin.qpf != null && bin.qpfMs > 0) {
      qpf += bin.qpf;
      qpfSeen = true;
      qpfMs += bin.qpfMs;
    }
    if (bin.tempMs > 0) {
      tempWeighted += bin.tempWeighted;
      tempMs += bin.tempMs;
    }
  }
  const coverage =
    totalMs > 0 ? Math.round(Math.min(1, snowMs / totalMs) * 100) / 100 : 0;
  return {
    snowIn: snowSeen ? round2(snow) : null,
    qpfIn: qpfSeen ? round2(qpf) : null,
    tempF: tempMs > 0 ? round1(tempWeighted / tempMs) : null,
    coverage,
  };
}

function hourEntry(bin) {
  return {
    start: new Date(bin.startMs).toISOString(),
    hourLocal: bin.hourLocal,
    snowIn: bin.snowMs > 0 && bin.snow != null ? round2(bin.snow) : null,
    qpfIn: bin.qpfMs > 0 && bin.qpf != null ? round2(bin.qpf) : null,
    tempF: bin.tempMs > 0 ? round1(bin.tempWeighted / bin.tempMs) : null,
  };
}

function binsOn(bins, dateKey, pred) {
  return [...bins.values()]
    .filter((bin) => pred(bin, dateKey))
    .sort((a, b) => a.startMs - b.startMs);
}

/**
 * Overnight is 5 PM–5 AM local, stored on the morning it ends.
 * Daytime is 5 AM–5 PM local. Hourly covers the local calendar day,
 * which is 23 or 25 hours across a DST transition.
 * Only days 0–3 relative to `now` in `timeZone` are returned.
 */
export function buildNwsWindows({
  snowfallAmount,
  quantitativePrecipitation,
  temperature,
  timeZone,
  now = new Date(),
  days = 4,
} = {}) {
  if (!timeZone) return [];
  const first = localDateKey(now instanceof Date ? now : new Date(now), timeZone);
  const bins = new Map();
  for (let i = -1; i < days; i += 1) {
    for (const start of localHourStarts(addCalendarDays(first, i), timeZone)) {
      bins.set(start, emptyBin(start, timeZone));
    }
  }
  pourSeries(bins, snowfallAmount?.values, snowfallAmount?.uom, timeZone, "snow", false);
  pourSeries(
    bins,
    quantitativePrecipitation?.values,
    quantitativePrecipitation?.uom,
    timeZone,
    "qpf",
    false
  );
  pourSeries(bins, temperature?.values, temperature?.uom, timeZone, "temp", false);
  const out = [];
  for (let i = 0; i < days; i += 1) {
    const date = addCalendarDays(first, i);
    const prev = addCalendarDays(date, -1);
    out.push({
      date,
      overnight: aggregateWindow(
        binsOn(
          bins,
          date,
          (bin) =>
            (bin.date === prev && bin.hourLocal >= 17) ||
            (bin.date === date && bin.hourLocal <= 4)
        )
      ),
      daytime: aggregateWindow(
        binsOn(
          bins,
          date,
          (bin) => bin.date === date && bin.hourLocal >= 5 && bin.hourLocal <= 16
        )
      ),
      hourly: binsOn(bins, date, (bin) => bin.date === date).map(hourEntry),
    });
  }
  return out;
}

/**
 * Daily snow inches from liquid QPF and the Kuchera curve at the
 * temperature overlapping each local hour. A day is omitted when liquid
 * falls in an hour with no temperature. A dry day (all QPF zero) is 0.
 */
export function slrInchesByDay({ quantitativePrecipitation, temperature, timeZone } = {}) {
  if (!timeZone) return [];
  const bins = new Map();
  pourSeries(
    bins,
    quantitativePrecipitation?.values,
    quantitativePrecipitation?.uom,
    timeZone,
    "qpf",
    true
  );
  pourSeries(bins, temperature?.values, temperature?.uom, timeZone, "temp", true);
  const byDate = new Map();
  for (const bin of bins.values()) {
    const list = byDate.get(bin.date) || [];
    list.push(bin);
    byDate.set(bin.date, list);
  }
  const days = [];
  for (const [date, list] of byDate) {
    let snow = 0;
    let sawQpf = false;
    let missing = false;
    for (const bin of list) {
      if (!(bin.qpfMs > 0) || bin.qpf == null) continue;
      sawQpf = true;
      if (!(bin.qpf > 0)) continue;
      if (!(bin.tempMs > 0)) {
        missing = true;
        break;
      }
      const inches = snowFromLiquid(bin.qpf, bin.tempWeighted / bin.tempMs);
      if (inches == null) {
        missing = true;
        break;
      }
      snow += inches;
    }
    if (!sawQpf || missing) continue;
    days.push({ date, inches: round2(snow) });
  }
  days.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return days;
}
