/**
 * National Weather Service snowfall periods are ISO-8601 intervals
 * (start/duration). Sum them onto local calendar days. A period that
 * crosses local midnight is split by the share of the interval on each day.
 */

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
