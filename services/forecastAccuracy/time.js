// Calendar helpers. Forecast valid dates are resort-local YYYY-MM-DD.
// SNOTEL dates are the station-local calendar dates AWDB already uses.

export function calendarParts(date, timeZone) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = fmt.formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value;
  let hour = Number(get("hour"));
  if (hour === 24) hour = 0;
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour,
    minute: Number(get("minute")),
    second: Number(get("second")),
  };
}

export function calendarDateInZone(date, timeZone) {
  const p = calendarParts(date, timeZone);
  const month = String(p.month).padStart(2, "0");
  const day = String(p.day).padStart(2, "0");
  return `${p.year}-${month}-${day}`;
}

export function addDays(isoDate, days) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export function diffCalendarDays(laterIso, earlierIso) {
  const later = Date.parse(`${laterIso}T00:00:00Z`);
  const earlier = Date.parse(`${earlierIso}T00:00:00Z`);
  return Math.round((later - earlier) / 86400000);
}

export function eachDate(begin, end) {
  const out = [];
  let cur = begin;
  while (cur <= end) {
    out.push(cur);
    cur = addDays(cur, 1);
    if (out.length > 400) break;
  }
  return out;
}

export function yesterdayLocal(timeZone, now = new Date()) {
  return addDays(calendarDateInZone(now, timeZone), -1);
}

// UTC instant of local midnight. Iterates because a single offset sample
// is wrong on the DST fallback day (local midnight and local noon can disagree).
export function zonedMidnightUtc(isoDate, timeZone) {
  const [y, m, d] = isoDate.split("-").map(Number);
  let utc = Date.UTC(y, m - 1, d, 12, 0, 0);
  for (let i = 0; i < 3; i += 1) {
    const shown = calendarParts(new Date(utc), timeZone);
    const shownAsUtc = Date.UTC(
      shown.year,
      shown.month - 1,
      shown.day,
      shown.hour,
      shown.minute,
      shown.second
    );
    const offset = shownAsUtc - utc;
    utc = Date.UTC(y, m - 1, d, 0, 0, 0) - offset;
  }
  const check = calendarParts(new Date(utc), timeZone);
  const matches =
    check.year === y &&
    check.month === m &&
    check.day === d &&
    check.hour === 0 &&
    check.minute === 0;
  if (matches) return new Date(utc);

  const start = utc - 6 * 3600000;
  for (let t = start; t < start + 12 * 3600000; t += 60000) {
    const p = calendarParts(new Date(t), timeZone);
    if (p.year === y && p.month === m && p.day === d && p.hour === 0 && p.minute === 0) {
      return new Date(t);
    }
  }
  return new Date(utc);
}

export function overlapHours(intervalStart, intervalEnd, isoDate, timeZone) {
  const dayStart = zonedMidnightUtc(isoDate, timeZone).getTime();
  const dayEnd = zonedMidnightUtc(addDays(isoDate, 1), timeZone).getTime();
  const a = Math.max(intervalStart.getTime(), dayStart);
  const b = Math.min(intervalEnd.getTime(), dayEnd);
  if (b <= a) return 0;
  return (b - a) / 3600000;
}

// Most recent 00:30Z or 12:30Z at or before `now`. Visual Crossing has no
// public model cycle, so retries inside one capture window share a runTime.
export function captureSlot(now) {
  const base = new Date(now);
  base.setUTCHours(0, 0, 0, 0);
  let best = null;
  for (let day = -1; day <= 0; day += 1) {
    for (const [hour, minute] of [
      [0, 30],
      [12, 30],
    ]) {
      const candidate = new Date(base.getTime() + day * 86400000);
      candidate.setUTCHours(hour, minute, 0, 0);
      if (candidate.getTime() <= now.getTime() && (best == null || candidate > best)) {
        best = candidate;
      }
    }
  }
  return best;
}
