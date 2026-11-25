/**
 * smsUtils.js
 *
 * Powder-alert SMS body builder plus a split helper that respects a
 * character limit. splitAggregatedMessages is a safety net; the compact
 * body should stay in a single Twilio send.
 */

const DASHBOARD_URL = "https://powalert.com/dashboard";
const SMS_HILL_LIMIT = 3;
const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * GSM 03.38 default alphabet (basic set). Characters not in this set or
 * the extended set force UCS-2 (70 chars / segment instead of 160).
 */
const GSM7_BASIC = new Set(
  `@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ ÆæßÉ !"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà`
);

/** Extended GSM-7 chars that consume two septets (escape + char). */
const GSM7_EXTENDED = new Set(["|", "^", "€", "{", "}", "[", "]", "~", "\\"]);

/**
 * Short weekday (Mon-style) from a forecast date, using the UTC calendar
 * day so date-only validTime strings do not shift with host timezone.
 * @param {Date|string} alertDate
 * @returns {string}
 */
export function shortWeekdayFromForecastDate(alertDate) {
  if (alertDate instanceof Date && !Number.isNaN(alertDate.getTime())) {
    return WEEKDAYS_SHORT[alertDate.getUTCDay()];
  }

  const raw = String(alertDate ?? "");
  const isoDay = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoDay) {
    const date = new Date(Date.UTC(Number(isoDay[1]), Number(isoDay[2]) - 1, Number(isoDay[3])));
    return WEEKDAYS_SHORT[date.getUTCDay()];
  }

  const parsed = new Date(alertDate);
  if (!Number.isNaN(parsed.getTime())) {
    return WEEKDAYS_SHORT[parsed.getUTCDay()];
  }

  return "Day";
}

/**
 * Compact integer inches for SMS.
 * @param {number} value
 * @returns {string}
 */
export function formatSnowInches(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0";
  return String(Math.round(n));
}

/**
 * One hill per resort, keeping the highest-snowfall alert. Sorted inches desc.
 * @param {Array<{resortId?: unknown, resortName: string, snowfall: number, alertDate: Date|string}>} alerts
 */
function uniqueResortsByMaxSnow(alerts) {
  const byResort = new Map();
  for (const alert of alerts) {
    const key =
      alert.resortId != null ? String(alert.resortId) : String(alert.resortName);
    const existing = byResort.get(key);
    if (!existing || Number(alert.snowfall) > Number(existing.snowfall)) {
      byResort.set(key, alert);
    }
  }
  return [...byResort.values()].sort(
    (a, b) => Number(b.snowfall) - Number(a.snowfall)
  );
}

/**
 * Compact GSM-7 powder-alert SMS body. Lodging stays out of the text.
 *
 * Single: `PowAlert: {Resort} {N}" {Day}. Open -> https://powalert.com/dashboard`
 * Multi:  `PowAlert: {R1} {N1}", {R2} {N2}", {R3} {N3}" {Day}. Open -> ...`
 * 4+:     top 3 + `+{k} more` then the same dashboard URL.
 *
 * Uses ASCII `->` instead of Unicode `→` so the message stays GSM-7
 * (1 segment at ≤160 chars) instead of UCS-2 (2 segments at ≤70).
 *
 * @param {Array<{resortId?: unknown, resortName: string, snowfall: number, alertDate: Date|string}>} alerts
 * @returns {string}
 */
export function buildPowderAlertSms(alerts) {
  if (!Array.isArray(alerts) || alerts.length === 0) {
    return "";
  }

  const ranked = uniqueResortsByMaxSnow(alerts);
  const day = shortWeekdayFromForecastDate(ranked[0].alertDate);
  const shown = ranked.slice(0, SMS_HILL_LIMIT);
  const extra = ranked.length - shown.length;

  const hills = shown
    .map((alert) => `${alert.resortName} ${formatSnowInches(alert.snowfall)}"`)
    .join(", ");
  const more = extra > 0 ? ` +${extra} more` : "";

  return `PowAlert: ${hills}${more} ${day}. Open -> ${DASHBOARD_URL}`;
}

/**
 * True when every character is in the GSM-7 default or extended alphabet.
 * @param {string} text
 * @returns {boolean}
 */
export function isGsm7(text) {
  for (const ch of text) {
    if (!GSM7_BASIC.has(ch) && !GSM7_EXTENDED.has(ch)) {
      return false;
    }
  }
  return true;
}

/**
 * GSM-7 septet length (extended chars count as 2).
 * @param {string} text
 * @returns {number}
 */
export function gsm7SeptetLength(text) {
  let length = 0;
  for (const ch of text) {
    length += GSM7_EXTENDED.has(ch) ? 2 : 1;
  }
  return length;
}

/**
 * Twilio-style SMS segment count. GSM-7: 160 / 153 concatenated.
 * UCS-2: 70 / 67 concatenated.
 * @param {string} text
 * @returns {{encoding: "gsm7"|"ucs2", characters: number, segments: number}}
 */
export function estimateSmsSegments(text) {
  const body = String(text ?? "");
  if (isGsm7(body)) {
    const characters = gsm7SeptetLength(body);
    const segments = characters === 0 ? 0 : characters <= 160 ? 1 : Math.ceil(characters / 153);
    return { encoding: "gsm7", characters, segments };
  }
  const characters = body.length;
  const segments = characters === 0 ? 0 : characters <= 70 ? 1 : Math.ceil(characters / 67);
  return { encoding: "ucs2", characters, segments };
}

/**
 * Splits an array of individual alert messages into SMS segments that are each below the character limit.
 * @param {string[]} alerts - The array of alert messages.
 * @param {number} [limit=1600] - The maximum number of characters per SMS segment.
 * @returns {string[]} - An array of SMS segments.
 */
export function splitAggregatedMessages(alerts, limit = 1600) {
  const separator = "\n\n----------------------\n\n";
  const segments = [];
  let currentSegment = "";

  for (const alert of alerts) {
    // If this is the first alert in the segment, add it without a separator.
    if (currentSegment === "") {
      if (alert.length > limit) {
        // If a single alert exceeds the limit, push it as its own segment.
        segments.push(alert);
      } else {
        currentSegment = alert;
      }
    } else {
      // Try appending the next alert with a separator.
      const candidate = currentSegment + separator + alert;
      if (candidate.length <= limit) {
        currentSegment = candidate;
      } else {
        // Save the current segment and start a new one.
        segments.push(currentSegment);
        currentSegment = alert;
      }
    }
  }

  // Push any remaining content as the last segment.
  if (currentSegment) {
    segments.push(currentSegment);
  }

  return segments;
}
