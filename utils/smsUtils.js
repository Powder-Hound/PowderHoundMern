/**
 * smsUtils.js
 *
 * Powder-alert SMS body builder plus a split helper that respects a
 * character limit. splitAggregatedMessages is a safety net; the compact
 * body should stay in a single Twilio send.
 */

import { buildStormMessages, groupQualifyingDays } from "./stormRadar.js";

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
 * Compact GSM-7 powder-alert SMS. One storm per resort: consecutive
 * qualifying days (or a single gap day) collapse to the peak inches.
 * Two sections when a caller passes pre-grouped storms via buildStormMessages.
 * Lodging and emoji stay out of the text. ASCII `->` keeps the body GSM-7.
 *
 * @param {Array<{resortId?: unknown, resortName: string, snowfall: number, alertDate: Date|string}>} alerts
 * @returns {string}
 */
export function buildPowderAlertSms(alerts) {
  if (!Array.isArray(alerts) || alerts.length === 0) {
    return "";
  }

  const byResort = new Map();
  for (const alert of alerts) {
    const resortId =
      alert.resortId != null ? String(alert.resortId) : String(alert.resortName);
    const day = {
      date: alert.start ?? alert.alertDate,
      inches: Number(alert.peakInches ?? alert.snowfall) || 0,
    };
    const existing = byResort.get(resortId);
    if (existing) {
      existing.days.push(day);
    } else {
      byResort.set(resortId, {
        resortId,
        resortName: alert.resortName,
        days: [day],
      });
    }
  }

  const triggered = [];
  for (const resort of byResort.values()) {
    for (const storm of groupQualifyingDays(resort.days, 0)) {
      triggered.push({
        resortId: resort.resortId,
        resortName: resort.resortName,
        ...storm,
        reason: "new",
      });
    }
  }

  return buildStormMessages({ triggered, monitoring: [] }).sms;
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
