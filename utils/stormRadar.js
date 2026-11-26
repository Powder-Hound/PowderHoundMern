/**
 * Storm grouping and the morning send rule for PowAlert.
 *
 * Qualifying days (snow >= the user's stick) at one resort form one storm
 * when they are consecutive or have at most one day between them.
 *
 * A user gets at most one message per morning, and only when a storm
 * triggers:
 *   - new: first time it is shown, lead time 1–15 days
 *   - checkpoint: first time it is shown in a closer band, after 3 days
 *   - upgrade: peak inches +6 or +50% vs last sent, after 2 days
 *     (the 2-day gap is waived when the storm starts within 3 days)
 *
 * Bands by days until storm start: early watch 13–15, plan 8–12,
 * lock-in 2–5. Showing a storm in either section resets its clock.
 */

const MS_DAY = 24 * 60 * 60 * 1000;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DASHBOARD_URL = "https://powalert.com/dashboard";

export const DEFAULT_STICK_INCHES = 12;
export const NEW_STORM_MIN_LEAD = 1;
export const NEW_STORM_MAX_LEAD = 15;
export const CHECKPOINT_COOLDOWN_DAYS = 3;
export const UPGRADE_INCHES = 6;
export const UPGRADE_RATIO = 1.5;
export const UPGRADE_GAP_DAYS = 2;
export const UPGRADE_NEAR_DAYS = 3;
export const SMS_RESORT_CAP = 4;
export const PUSH_RESORT_CAP = 4;

export const STORM_BANDS = {
  early_watch: { min: 13, max: 15 },
  plan: { min: 8, max: 12 },
  lock_in: { min: 2, max: 5 },
};

const BAND_RANK = { early_watch: 1, plan: 2, lock_in: 3 };

export function utcDay(value) {
  if (value == null || value === "") return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }
  const raw = String(value).trim();
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    return new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
}

export function daysBetween(earlier, later) {
  const start = utcDay(earlier);
  const end = utcDay(later);
  if (!start || !end) return NaN;
  return Math.round((end.getTime() - start.getTime()) / MS_DAY);
}

export function addUtcDays(value, days) {
  const day = utcDay(value);
  if (!day) return null;
  const next = new Date(day.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function stickInches(user) {
  const value = Number(user?.alertThreshold?.preferredResorts);
  if (!Number.isFinite(value)) return DEFAULT_STICK_INCHES;
  return value;
}

export function roundInches(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n);
}

export function bandForLead(leadDays) {
  const lead = Number(leadDays);
  if (!Number.isFinite(lead)) return null;
  if (lead >= STORM_BANDS.early_watch.min && lead <= STORM_BANDS.early_watch.max) {
    return "early_watch";
  }
  if (lead >= STORM_BANDS.plan.min && lead <= STORM_BANDS.plan.max) return "plan";
  if (lead >= STORM_BANDS.lock_in.min && lead <= STORM_BANDS.lock_in.max) return "lock_in";
  return null;
}

function weekday(value) {
  const day = utcDay(value);
  if (!day) return "Day";
  return WEEKDAYS[day.getUTCDay()];
}

function daySpan(start, end) {
  const open = weekday(start);
  const close = weekday(end ?? start);
  if (!end || utcDay(start)?.getTime() === utcDay(end)?.getTime()) return open;
  if (open === close) return open;
  return `${open}-${close}`;
}

/**
 * Group upcoming qualifying days into storms. `days` are { date, inches }.
 * A gap of 0 (next day) or 1 (one skipped day) stays in the same storm.
 */
export function groupQualifyingDays(days, threshold) {
  const parsed = [];
  for (const day of days || []) {
    const date = utcDay(day.date ?? day.validTime);
    const inches = Number(day.inches ?? day.snow?.value);
    if (!date || !Number.isFinite(inches) || inches < threshold) continue;
    parsed.push({ date, inches });
  }
  parsed.sort((a, b) => a.date - b.date);

  const qualifying = [];
  for (const day of parsed) {
    const previous = qualifying[qualifying.length - 1];
    if (previous && previous.date.getTime() === day.date.getTime()) {
      previous.inches = Math.max(previous.inches, day.inches);
      continue;
    }
    qualifying.push(day);
  }

  const storms = [];
  for (const day of qualifying) {
    const current = storms[storms.length - 1];
    const gap = current ? daysBetween(current.end, day.date) - 1 : Infinity;
    if (!current || gap > 1) {
      storms.push({
        start: day.date,
        end: day.date,
        peakDate: day.date,
        peakInches: day.inches,
        totalInches: day.inches,
        days: [day],
      });
      continue;
    }
    current.end = day.date;
    current.totalInches += day.inches;
    current.days.push(day);
    if (day.inches > current.peakInches) {
      current.peakInches = day.inches;
      current.peakDate = day.date;
    }
  }
  return storms;
}

export function stormsForResort(resort, threshold, now) {
  const today = utcDay(now);
  const upcoming = (resort?.days || [])
    .map((day) => ({
      date: utcDay(day.date ?? day.validTime),
      inches: Number(day.inches ?? day.snow?.value) || 0,
    }))
    .filter((day) => day.date && daysBetween(today, day.date) >= 0);

  return groupQualifyingDays(upcoming, threshold).map((storm) => ({
    resortId: resort.resortId,
    resortName: resort.resortName,
    ...storm,
    leadDays: daysBetween(today, storm.start),
  }));
}

function intervalGapDays(aStart, aEnd, bStart, bEnd) {
  const aOpen = utcDay(aStart)?.getTime();
  const aClose = utcDay(aEnd)?.getTime();
  const bOpen = utcDay(bStart)?.getTime();
  const bClose = utcDay(bEnd)?.getTime();
  if ([aOpen, aClose, bOpen, bClose].some((value) => value == null)) return Infinity;
  if (aOpen <= bClose && bOpen <= aClose) return 0;
  if (aClose < bOpen) return daysBetween(aClose, bOpen) - 1;
  return daysBetween(bClose, aOpen) - 1;
}

function matchStates(storms, states) {
  const unused = new Set((states || []).map((_, index) => index));
  return storms.map((storm) => {
    let best = null;
    let bestGap = Infinity;
    for (const index of unused) {
      const state = states[index];
      if (String(state.resortId) !== String(storm.resortId)) continue;
      const gap = intervalGapDays(state.stormStart, state.stormEnd, storm.start, storm.end);
      if (gap <= 1 && gap < bestGap) {
        best = index;
        bestGap = gap;
      }
    }
    if (best == null) return null;
    unused.delete(best);
    return states[best];
  });
}

function primaryReason(reasons) {
  if (reasons.includes("new")) return "new";
  if (reasons.includes("upgrade")) return "upgrade";
  if (reasons.includes("checkpoint")) return "checkpoint";
  return null;
}

export function evaluateStormTrigger(storm, state, now) {
  const today = utcDay(now);
  const lead = Number.isFinite(Number(storm.leadDays))
    ? Number(storm.leadDays)
    : daysBetween(today, storm.start);
  const band = bandForLead(lead);
  const lastShownAt = state?.lastShownAt ? utcDay(state.lastShownAt) : null;
  const neverShown = !lastShownAt;
  const daysSince = neverShown ? null : daysBetween(lastShownAt, today);
  const reasons = [];

  if (neverShown && lead >= NEW_STORM_MIN_LEAD && lead <= NEW_STORM_MAX_LEAD) {
    reasons.push("new");
  }

  if (!neverShown && band) {
    const lastRank = BAND_RANK[state.lastShownBand] || 0;
    if (BAND_RANK[band] > lastRank && daysSince >= CHECKPOINT_COOLDOWN_DAYS) {
      reasons.push("checkpoint");
    }
  }

  if (!neverShown && state.lastShownInches != null) {
    const shownInches = roundInches(storm.peakInches);
    const lastInches = roundInches(state.lastShownInches);
    const jumped =
      shownInches >= lastInches + UPGRADE_INCHES || shownInches >= lastInches * UPGRADE_RATIO;
    const gapOk = lead <= UPGRADE_NEAR_DAYS || daysSince >= UPGRADE_GAP_DAYS;
    if (lastInches > 0 && jumped && gapOk) reasons.push("upgrade");
  }

  return {
    triggered: reasons.length > 0,
    reasons,
    reason: primaryReason(reasons),
    band,
    leadDays: lead,
    daysSinceShown: daysSince,
  };
}

function bandAfterShow(previousBand, currentBand) {
  if (!currentBand) return previousBand ?? null;
  if (!previousBand) return currentBand;
  return BAND_RANK[currentBand] >= BAND_RANK[previousBand] ? currentBand : previousBand;
}

function sortByPeak(storms) {
  storms.sort(
    (a, b) =>
      roundInches(b.peakInches) - roundInches(a.peakInches) ||
      String(a.resortName).localeCompare(String(b.resortName))
  );
  return storms;
}

/**
 * Decide whether this user gets a morning message, and the next Mongo
 * state for every active storm. When anything triggers, every active
 * storm is shown and its display clock resets.
 */
export function planMorningAlert(storms, states = [], now = new Date()) {
  const today = utcDay(now);
  const active = (storms || [])
    .map((storm) => {
      const lead = Number.isFinite(Number(storm.leadDays))
        ? Number(storm.leadDays)
        : daysBetween(today, storm.start);
      return { ...storm, leadDays: lead };
    })
    .filter((storm) => storm.leadDays >= 0);
  const matched = matchStates(active, states);
  const rows = active.map((storm, index) => ({
    storm,
    state: matched[index],
    decision: evaluateStormTrigger(storm, matched[index], today),
  }));
  const send = rows.some((row) => row.decision.triggered);

  const triggered = [];
  const monitoring = [];
  const nextStates = rows.map((row) => {
    const { storm, state, decision } = row;
    const previousBand = state?.lastShownBand ?? null;
    const view = {
      ...storm,
      leadDays: decision.leadDays,
      band: decision.band,
      reason: decision.reason,
      reasons: decision.reasons,
    };
    const persist = {
      _id: state?._id ?? null,
      resortId: storm.resortId,
      resortName: storm.resortName,
      stormStart: utcDay(storm.start),
      stormEnd: utcDay(storm.end),
      peakDate: utcDay(storm.peakDate ?? storm.start),
      peakInches: storm.peakInches,
      totalInches: storm.totalInches,
      leadDays: decision.leadDays,
      lastShownAt: send ? today : state?.lastShownAt ? utcDay(state.lastShownAt) : null,
      lastShownInches: send
        ? roundInches(storm.peakInches)
        : state?.lastShownInches ?? null,
      lastShownBand: send ? bandAfterShow(previousBand, decision.band) : previousBand,
      lastTrigger: decision.triggered ? decision.reason : state?.lastTrigger ?? null,
    };
    if (decision.triggered) triggered.push(view);
    else monitoring.push(view);
    return persist;
  });

  sortByPeak(triggered);
  sortByPeak(monitoring);

  if (!send) {
    return { send: false, triggered: [], monitoring: [], nextStates };
  }
  return { send: true, triggered, monitoring, nextStates };
}

function reasonSentence(reason) {
  if (reason === "new") return "New storm.";
  if (reason === "upgrade") return "Forecast jumped.";
  if (reason === "checkpoint") return "Still on track.";
  return "";
}

function smsLine(storm) {
  return `${storm.resortName} ${roundInches(storm.peakInches)}" ${daySpan(storm.start, storm.end)}`;
}

function pushLine(storm) {
  const lead = Number(storm.leadDays);
  if (!Number.isFinite(lead)) return smsLine(storm);
  if (lead === 0) return `${smsLine(storm)} (today)`;
  return `${smsLine(storm)} (${lead}d)`;
}

export function formatStormEmailLine(storm) {
  const peak = roundInches(storm.peakInches);
  const total = roundInches(storm.totalInches);
  const lead = Number(storm.leadDays);
  const leadText = !Number.isFinite(lead)
    ? ""
    : lead === 0
      ? "today"
      : lead === 1
        ? "1 day out"
        : `${lead} days out`;
  const totalBit = total === peak ? "" : `, ${total}" over the storm`;
  const when = leadText ? `, starts ${daySpan(storm.start, storm.end)} (${leadText})` : `, starts ${daySpan(storm.start, storm.end)}`;
  const reason = reasonSentence(storm.reason);
  return `${storm.resortName}: ${peak}" peak${totalBit}${when}.${reason ? ` ${reason}` : ""}`;
}

function renderCapped(triggered, monitoring, cap, lineFn, includeOpen) {
  const tagged = [
    ...triggered.map((storm) => ({ storm, section: "new" })),
    ...monitoring.map((storm) => ({ storm, section: "other" })),
  ];
  if (tagged.length === 0) return "";
  const shown = cap == null ? tagged : tagged.slice(0, cap);
  const hidden = tagged.length - shown.length;
  const parts = [];
  const newLines = shown.filter((row) => row.section === "new").map((row) => lineFn(row.storm));
  const otherLines = shown.filter((row) => row.section === "other").map((row) => lineFn(row.storm));
  if (newLines.length) parts.push(["New PowAlerts!", ...newLines].join("\n"));
  if (otherLines.length) {
    parts.push(["Other PowAlerts You're Monitoring", ...otherLines].join("\n"));
  }
  let body = parts.join("\n");
  if (hidden > 0) body += `\n+${hidden} more`;
  if (includeOpen) body += `\nOpen -> ${DASHBOARD_URL}`;
  return body;
}

export function buildStormMessages({ triggered = [], monitoring = [] } = {}) {
  const rankedTriggered = sortByPeak([...triggered]);
  const rankedMonitoring = sortByPeak([...monitoring]);
  const emailBlocks = [];
  if (rankedTriggered.length || rankedMonitoring.length) {
    if (rankedTriggered.length) {
      emailBlocks.push("New PowAlerts!", "", ...rankedTriggered.map(formatStormEmailLine));
    }
    if (rankedMonitoring.length) {
      emailBlocks.push(
        "",
        "Other PowAlerts You're Monitoring",
        "",
        ...rankedMonitoring.map(formatStormEmailLine)
      );
    }
    emailBlocks.push("", `Open -> ${DASHBOARD_URL}`);
  }

  return {
    sms: renderCapped(rankedTriggered, rankedMonitoring, SMS_RESORT_CAP, smsLine, true),
    email: emailBlocks.join("\n"),
    pushTitle: rankedTriggered.length ? "New PowAlerts!" : "",
    pushBody: renderCapped(rankedTriggered, rankedMonitoring, PUSH_RESORT_CAP, pushLine, true),
  };
}

export const POWDER_DASHBOARD_URL = DASHBOARD_URL;
