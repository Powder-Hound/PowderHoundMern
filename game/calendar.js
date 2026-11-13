import { E } from "./economics.config.js";

export function dateParts(iso) {
  const [year, month, day] = String(iso).slice(0, 10).split("-").map(Number);
  return {
    year,
    month,
    day,
    utc: new Date(Date.UTC(year, month - 1, day)),
  };
}

export function addDays(iso, count) {
  const { year, month, day } = dateParts(iso);
  const utc = new Date(Date.UTC(year, month - 1, day));
  utc.setUTCDate(utc.getUTCDate() + count);
  return utc.toISOString().slice(0, 10);
}

export function dayOfWeek(iso) {
  return dateParts(iso).utc.getUTCDay();
}

export function isWeekend(iso) {
  const dow = dayOfWeek(iso);
  const cal = E.holidayCalendar;
  return dow === cal.sunday || dow === cal.saturday;
}

function nthWeekday(year, monthIndex, weekday, n) {
  const first = new Date(Date.UTC(year, monthIndex, 1));
  const shift = (weekday - first.getUTCDay() + E.daysPerWeek) % E.daysPerWeek;
  return 1 + shift + (n - 1) * E.daysPerWeek;
}

export function isHoliday(iso) {
  const { year, month, day } = dateParts(iso);
  const cal = E.holidayCalendar;
  if (month === cal.christmasStartMonth && day >= cal.christmasStartDay) return true;
  if (month === cal.christmasEndMonth && day <= cal.christmasEndDay) return true;
  if (month === cal.thanksgivingMonth) {
    const thanksgiving = nthWeekday(
      year,
      cal.novemberIndex,
      cal.thanksgivingWeekday,
      cal.thanksgivingNth
    );
    if (day >= thanksgiving && day < thanksgiving + cal.thanksgivingSpanDays) return true;
  }
  if (month === cal.mlkMonth) {
    const mlk = nthWeekday(year, cal.januaryIndex, cal.mlkWeekday, cal.mlkNth);
    if (day <= mlk && day >= mlk - cal.weekendLeadDays) return true;
  }
  if (month === cal.presidentsMonth) {
    const presidents = nthWeekday(
      year,
      cal.februaryIndex,
      cal.presidentsWeekday,
      cal.presidentsNth
    );
    if (day <= presidents && day >= presidents - cal.weekendLeadDays) return true;
  }
  return false;
}

export function demandWeight(iso) {
  if (isHoliday(iso)) return E.holidayWeight;
  if (isWeekend(iso)) return E.weekendWeight;
  return E.weekdayWeight;
}

export function meanWeight(startDate, days) {
  let sum = 0;
  for (let i = 0; i < days; i += 1) sum += demandWeight(addDays(startDate, i));
  return sum / days;
}

/**
 * First Saturday on or after December 1 of this winter, and never before today.
 * May–December looks ahead to this December. January–April is already inside
 * the season that opened last December, so the default is the next Saturday.
 */
export function defaultSeasonStart(todayIso) {
  const { year, month } = dateParts(todayIso);
  const decemberYear = month >= E.holidayCalendar.mayMonth ? year : year - 1;
  const monthText = String(E.holidayCalendar.seasonOpenMonth).padStart(2, "0");
  const dayText = String(E.holidayCalendar.seasonOpenDay).padStart(2, "0");
  let cursor = `${decemberYear}-${monthText}-${dayText}`;
  if (cursor < todayIso) cursor = todayIso;
  while (dayOfWeek(cursor) !== E.holidayCalendar.saturday) {
    cursor = addDays(cursor, 1);
  }
  return cursor;
}
