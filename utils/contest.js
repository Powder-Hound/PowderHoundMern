import { createHash, randomBytes, randomInt } from "node:crypto";
import { User } from "../models/users.model.js";
import { digitsPhone } from "./phone.js";

/**
 * One Extra Storm (2026/27) — unique-link + signup tracking.
 *
 * CONTEST WINDOW (America/Denver, MDT in September):
 *   CONTEST_START_LOCAL  2026-09-08T00:00:00
 *   CONTEST_END_LOCAL    2026-09-28T23:59:59
 *
 * Public unique link: https://powalert.com/go?ref={CODE}
 * Also accepted:      https://powalert.com/go?from=win&ref=CODE
 * Persist field: `ref` or `referredBy` (same code).
 *
 * Contest mint (refCode + 1 base entry), referral +5, and draw eligibility
 * are window-gated. Finished /go outside the window still persists the watch.
 * In-window rows stay draw-eligible after close if not fraudFlag. Cron off.
 *
 * Prize (do not implement payment): one 2026/27 adult Epic or Ikon.
 * Honor-system follow extras: +1 per network (x/tiktok/instagram/facebook),
 * max 4, idempotent, not API-verified. Referral +5 on finished OTP is the
 * only verified multiplier. No Gleam. No OAuth. Cron stays off.
 */

export const CONTEST_TIME_ZONE = "America/Denver";
export const CONTEST_START_LOCAL = "2026-09-08T00:00:00";
export const CONTEST_END_LOCAL = "2026-09-28T23:59:59";
export const CONTEST_BASE_ENTRIES = 1;
export const CONTEST_REFERRAL_ENTRIES = 5;
export const CONTEST_SHARE_ORIGIN = "https://powalert.com/go";
export const SAME_IP_CLUSTER_THRESHOLD = 3;
/** SPA + mint + sanitize share this exact alphabet and length. Do not change minted format. */
export const REF_CODE = Object.freeze({
  alphabet: "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789",
  length: 8,
});
export const REF_CODE_LENGTH = REF_CODE.length;
export const REF_CODE_ALPHABET = REF_CODE.alphabet;

export const CONTEST_SERVER_FIELDS = [
  "refCode",
  "entries",
  "referredCompleteCount",
  "ipHash",
  "fraudFlag",
  "fraudReasons",
  "referralCredited",
  "referralCreditEligible",
  "baseEntryGranted",
  "followClaims",
  "contestEnteredAt",
  "contestDrawLocked",
  "contestDrawnAt",
  "contestEntriesAtDraw",
];

export const FOLLOW_NETWORKS = ["x", "tiktok", "instagram", "facebook"];
export const FOLLOW_EXTRA_PER_NETWORK = 1;
export const FOLLOW_EXTRA_MAX = 4;
/** v1: only X is confirmed in the SPA. Other keys are accepted for later. */
export const FOLLOW_V1_CONFIRMED = { x: "@pow_alert" };

const SKI_PASSES = ["Epic", "Ikon", "Indy", "MountainCollective"];

const DISPOSABLE_EMAIL_DOMAINS = new Set([
  "mailinator.com",
  "guerrillamail.com",
  "sharklasers.com",
  "grr.la",
  "yopmail.com",
  "tempmail.com",
  "temp-mail.org",
  "10minutemail.com",
  "throwaway.email",
  "trashmail.com",
  "fakeinbox.com",
  "getnada.com",
  "discard.email",
  "mailnesia.com",
]);

export function contestWindowMeta() {
  return {
    timeZone: CONTEST_TIME_ZONE,
    start: CONTEST_START_LOCAL,
    end: CONTEST_END_LOCAL,
    referralEntries: CONTEST_REFERRAL_ENTRIES,
    baseEntries: CONTEST_BASE_ENTRIES,
    note: "refCode + base entry + referral +5 mint only inside this America/Denver window. In-window rows stay draw-eligible after close if not fraudFlag.",
  };
}

export function denverDateTime(now = new Date()) {
  const date = now instanceof Date ? now : new Date(now);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: CONTEST_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const g = (type) => parts.find((p) => p.type === type)?.value ?? "00";
  return `${g("year")}-${g("month")}-${g("day")}T${g("hour")}:${g("minute")}:${g("second")}`;
}

export function isWithinContestWindow(now = new Date()) {
  const local = denverDateTime(now);
  return local >= CONTEST_START_LOCAL && local <= CONTEST_END_LOCAL;
}

export function hasSkiPass(user) {
  const skiPass = user?.resortPreference?.skiPass ?? {};
  return SKI_PASSES.some((key) => Boolean(skiPass[key]));
}

export function hasBothSticks(user) {
  const preferred = Number(user?.alertThreshold?.preferredResorts);
  const anyResort = Number(user?.alertThreshold?.anyResort);
  return Number.isFinite(preferred) && Number.isFinite(anyResort);
}

/**
 * Finished /go eligibility gate (server-side).
 * name + ski pass + ≥1 hill + both sticks (preferredResorts + anyResort) + phone OTP SID.
 * Bare signup (phone+SID only) is not finished and must not mint a winning entry.
 */
export function isFinishedGo(user) {
  const name = String(user?.name ?? "").trim();
  const resorts = user?.resortPreference?.resorts;
  const hillCount = Array.isArray(resorts) ? resorts.length : 0;
  return Boolean(
    name &&
      hasSkiPass(user) &&
      hillCount >= 1 &&
      hasBothSticks(user) &&
      user?.phoneVerifySID
  );
}

export function mintRefCode(length = REF_CODE.length) {
  const { alphabet } = REF_CODE;
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}

export function isUrlSafeRefCode(code) {
  if (typeof code !== "string" || code.length !== REF_CODE.length) {
    return false;
  }
  for (const char of code) {
    if (!REF_CODE.alphabet.includes(char)) return false;
  }
  return true;
}

/**
 * Pull a ref code from a bare code, `?ref=CODE`, or `?from=win&ref=CODE`.
 * `from=win` is accepted and ignored. Scoring is unchanged.
 */
export function extractRefCode(value) {
  const raw = String(value ?? "").trim();
  if (isUrlSafeRefCode(raw)) return raw;
  try {
    const url = raw.includes("://")
      ? new URL(raw)
      : raw.startsWith("?") || /(?:^|[?&])ref=/.test(raw)
        ? new URL(raw.startsWith("?") ? raw : `?${raw}`, CONTEST_SHARE_ORIGIN)
        : null;
    const code = url?.searchParams.get("ref");
    return isUrlSafeRefCode(code) ? code : "";
  } catch {
    return "";
  }
}

export function readReferredBy(body = {}) {
  return extractRefCode(body.referredBy ?? body.ref ?? "");
}

export function stripContestServerFields(body = {}) {
  const next = { ...body };
  for (const key of CONTEST_SERVER_FIELDS) {
    delete next[key];
  }
  return next;
}

export function sanitizeUserWrite(body = {}) {
  const referredBy = readReferredBy(body);
  const safeFields = stripContestServerFields(body);
  delete safeFields.ref;
  delete safeFields.referredBy;
  delete safeFields.permissions;
  return { referredBy, safeFields };
}

export function contestShareUrl(refCode) {
  if (!refCode) return "";
  return `${CONTEST_SHARE_ORIGIN}?ref=${refCode}`;
}

export function clientIpFromReq(req) {
  const forwarded = req?.headers?.["x-forwarded-for"];
  if (forwarded) {
    return String(forwarded).split(",")[0].trim();
  }
  return String(req?.ip || req?.socket?.remoteAddress || "").trim();
}

export function hashIp(ip, secret = process.env.JWT_SECRET || "contest-ip-salt") {
  const value = String(ip ?? "").trim();
  if (!value) return "";
  return createHash("sha256").update(`${secret}:${value}`).digest("hex");
}

export function maskPhone(phone) {
  const digits = digitsPhone(phone);
  if (!digits) return "";
  if (digits.length <= 4) return "*".repeat(digits.length);
  return `${"*".repeat(digits.length - 4)}${digits.slice(-4)}`;
}

export function emailDomain(email) {
  const value = String(email ?? "").trim().toLowerCase();
  const at = value.lastIndexOf("@");
  if (at < 0) return "";
  return value.slice(at + 1);
}

/**
 * Inclusive count of rows that share this ipHash, including the user
 * being saved when their hash is not in the collection yet.
 * Threshold 3 must flag the 3rd signup (not the 4th).
 */
export function sameIpInclusiveCount({
  existingWithHash = 0,
  alreadyHasThisHash = false,
} = {}) {
  return existingWithHash + (alreadyHasThisHash ? 0 : 1);
}

export function detectFraud({ sameIpCount = 0, email } = {}) {
  const reasons = [];
  if (sameIpCount >= SAME_IP_CLUSTER_THRESHOLD) {
    reasons.push("same_ip_cluster");
  }
  const domain = emailDomain(email);
  if (domain && DISPOSABLE_EMAIL_DOMAINS.has(domain)) {
    reasons.push("disposable_email");
  }
  return { flag: reasons.length > 0, reasons };
}

export function isSelfReferral({ user, referrer, referredBy } = {}) {
  if (!user || !referrer) return false;
  if (String(user._id) === String(referrer._id)) return true;
  const userPhone = digitsPhone(user.phoneNumber);
  const referrerPhone = digitsPhone(referrer.phoneNumber);
  if (userPhone && userPhone === referrerPhone) return true;
  if (user.refCode && referredBy && user.refCode === referredBy) return true;
  return false;
}

export function shouldCreditReferral({
  user,
  referrer,
  now = new Date(),
  wasAlreadyFinished = false,
} = {}) {
  if (wasAlreadyFinished) {
    return { ok: false, reason: "already_finished" };
  }
  if (user?.referralCredited) {
    return { ok: false, reason: "already_credited" };
  }
  if (!user?.referralCreditEligible) {
    return { ok: false, reason: "phone_already_existed" };
  }
  if (!user?.referredBy) {
    return { ok: false, reason: "no_referred_by" };
  }
  if (!isFinishedGo(user)) {
    return { ok: false, reason: "not_finished" };
  }
  if (!isWithinContestWindow(now)) {
    return { ok: false, reason: "outside_window" };
  }
  if (!referrer?.refCode) {
    return { ok: false, reason: "referrer_not_found" };
  }
  if (!isFinishedGo(referrer)) {
    return { ok: false, reason: "referrer_not_finished" };
  }
  if (referrer.refCode !== user.referredBy) {
    return { ok: false, reason: "code_mismatch" };
  }
  if (isSelfReferral({ user, referrer, referredBy: user.referredBy })) {
    return { ok: false, reason: "self_referral" };
  }
  return { ok: true, reason: "credited", entries: CONTEST_REFERRAL_ENTRIES };
}

/**
 * Pure state transition after a user row is saved.
 * Tests the A→CODE, B→+5 path without touching Mongo.
 */
export function planContestAfterSave({
  user,
  referrer = null,
  sameIpCount = 0,
  wasAlreadyFinished = false,
  now = new Date(),
  ipHash = "",
} = {}) {
  const userSet = {};
  if (ipHash && ipHash !== user.ipHash) {
    userSet.ipHash = ipHash;
  }

  const merged = { ...user, ...userSet };
  const finished = isFinishedGo(merged);
  const inWindow = isWithinContestWindow(now);

  // Contest mint only inside the Denver window. Watch persist still happens
  // on the user row; we just skip refCode / base entry / draw eligibility.
  if (finished && inWindow && !user.refCode) {
    userSet.refCode = mintRefCode();
    userSet.contestEnteredAt = now instanceof Date ? now : new Date(now);
  }
  // Follow extras increment `entries` too; do not treat that as the base entry.
  // Users who already have a refCode were granted the base before this flag.
  if (finished && inWindow && !user.baseEntryGranted) {
    if (!user.refCode) {
      userSet.entries = (Number(user.entries) || 0) + CONTEST_BASE_ENTRIES;
    }
    userSet.baseEntryGranted = true;
  }

  const fraud = detectFraud({
    sameIpCount,
    email: merged.email,
  });
  if (fraud.flag) {
    userSet.fraudFlag = true;
    userSet.fraudReasons = [
      ...new Set([...(user.fraudReasons || []), ...fraud.reasons]),
    ];
  }

  const creditUser = {
    ...merged,
    ...userSet,
  };
  const credit = shouldCreditReferral({
    user: creditUser,
    referrer,
    now,
    wasAlreadyFinished,
  });

  let referrerInc = null;
  if (credit.ok) {
    userSet.referralCredited = true;
    referrerInc = {
      entries: CONTEST_REFERRAL_ENTRIES,
      referredCompleteCount: 1,
    };
  }

  return {
    userSet,
    referrerInc,
    creditReason: credit.reason,
    shareUrl: contestShareUrl(userSet.refCode || user.refCode),
  };
}

export async function applyContestOnUserSave({
  user,
  wasAlreadyFinished = false,
  clientIp = "",
  now = new Date(),
} = {}) {
  if (!user?._id) return user;

  const plain = typeof user.toObject === "function" ? user.toObject() : { ...user };
  const ipHash = hashIp(clientIp) || plain.ipHash || "";
  const existingWithHash = ipHash
    ? await User.countDocuments({ ipHash })
    : 0;
  const sameIpCount = sameIpInclusiveCount({
    existingWithHash,
    alreadyHasThisHash: Boolean(ipHash && plain.ipHash === ipHash),
  });

  let referrer = null;
  if (plain.referredBy) {
    referrer = await User.findOne({ refCode: plain.referredBy });
  }

  const plan = planContestAfterSave({
    user: plain,
    referrer: referrer
      ? typeof referrer.toObject === "function"
        ? referrer.toObject()
        : referrer
      : null,
    sameIpCount,
    wasAlreadyFinished,
    now,
    ipHash,
  });

  const userSet = { ...plan.userSet };
  delete userSet.referralCredited;

  if (Object.keys(userSet).length > 0) {
    try {
      await User.updateOne({ _id: user._id }, { $set: userSet });
    } catch (error) {
      if (error?.code === 11000 && userSet.refCode) {
        userSet.refCode = mintRefCode();
        await User.updateOne({ _id: user._id }, { $set: userSet });
      } else {
        throw error;
      }
    }
  }

  if (plan.referrerInc && referrer) {
    const claimed = await User.findOneAndUpdate(
      { _id: user._id, referralCredited: { $ne: true } },
      { $set: { referralCredited: true } }
    );
    if (claimed) {
      await User.updateOne({ _id: referrer._id }, { $inc: plan.referrerInc });
    }
  }

  return User.findById(user._id);
}

export function followClaimList(user) {
  if (!Array.isArray(user?.followClaims)) return [];
  return user.followClaims.filter((claim) =>
    FOLLOW_NETWORKS.includes(claim?.network)
  );
}

export function followClaimSummary(user) {
  const networks = followClaimList(user).map((claim) => claim.network);
  return {
    followClaimCount: networks.length,
    followNetworks: networks.join("|"),
  };
}

export function normalizeFollowNetwork(network) {
  const key = String(network ?? "").trim().toLowerCase();
  return FOLLOW_NETWORKS.includes(key) ? key : "";
}

export function normalizeFollowHandle(handle) {
  return String(handle ?? "").trim().slice(0, 64);
}

/**
 * Honor-system follow extra. +1 once per network, max 4.
 * Second claim for the same network is a no-op. Not API-verified.
 */
export function planFollowClaim({ user, network, handle, now = new Date() } = {}) {
  const key = normalizeFollowNetwork(network);
  if (!key) {
    return { ok: false, status: 400, reason: "invalid_network" };
  }

  const claims = followClaimList(user);
  if (claims.some((claim) => claim.network === key)) {
    return {
      ok: true,
      noop: true,
      reason: "already_claimed",
      entriesDelta: 0,
      followClaims: user.followClaims || claims,
    };
  }
  if (claims.length >= FOLLOW_EXTRA_MAX) {
    return {
      ok: true,
      noop: true,
      reason: "max_follow_extras",
      entriesDelta: 0,
      followClaims: user.followClaims || claims,
    };
  }

  const nextClaims = [
    ...claims,
    {
      network: key,
      handle: normalizeFollowHandle(handle),
      claimedAt: now instanceof Date ? now : new Date(now),
    },
  ];
  return {
    ok: true,
    noop: false,
    reason: "claimed",
    entriesDelta: FOLLOW_EXTRA_PER_NETWORK,
    entries: (Number(user?.entries) || 0) + FOLLOW_EXTRA_PER_NETWORK,
    followClaims: nextClaims,
  };
}

export function toAdminRow(user) {
  const follows = followClaimSummary(user);
  return {
    phoneMasked: maskPhone(user.phoneNumber),
    createdAt: user.createdAt ?? null,
    refCode: user.refCode || "",
    entries: Number(user.entries) || 0,
    referredCompleteCount: Number(user.referredCompleteCount) || 0,
    referredBy: user.referredBy || "",
    ipHash: user.ipHash || "",
    fraudFlag: Boolean(user.fraudFlag),
    followClaimCount: follows.followClaimCount,
    followNetworks: follows.followNetworks,
  };
}

export function csvCell(value) {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export const ADMIN_CSV_COLUMNS = [
  "phoneMasked",
  "createdAt",
  "refCode",
  "entries",
  "referredCompleteCount",
  "referredBy",
  "ipHash",
  "fraudFlag",
  "followClaimCount",
  "followNetworks",
];

export function adminEntriesToCsv(rows) {
  const header = ADMIN_CSV_COLUMNS.join(",");
  const lines = rows.map((row) =>
    ADMIN_CSV_COLUMNS.map((col) => csvCell(row[col])).join(",")
  );
  return [header, ...lines].join("\n");
}

export function contestCohortFilter() {
  return {
    $or: [
      { refCode: { $exists: true, $nin: [null, ""] } },
      { referredBy: { $exists: true, $nin: [null, ""] } },
      { entries: { $gt: 0 } },
      { referralCreditEligible: true },
    ],
  };
}

export function isDrawEligible(user) {
  return Boolean(
    user?.refCode &&
      isFinishedGo(user) &&
      Number(user.entries) >= 1 &&
      !user.fraudFlag
  );
}

export function formatLockedDraw(user) {
  if (!user) return null;
  return {
    winnerUserId: String(user._id),
    drawnAt: user.contestDrawnAt ?? null,
    entriesAtDraw: user.contestEntriesAtDraw ?? (Number(user.entries) || 0),
    winner: {
      ...toAdminRow(user),
      finishedGo: isFinishedGo(user),
    },
  };
}

/**
 * If a winner is already locked, return it (no re-roll).
 * Otherwise pick 1 eligible row. Caller persists the lock.
 */
export function resolveDraw({
  lockedWinner = null,
  rows = [],
  random = secureUnitRandom,
} = {}) {
  if (lockedWinner) {
    const locked = formatLockedDraw(lockedWinner);
    return {
      alreadyLocked: true,
      winner: lockedWinner,
      eligibleCount: null,
      totalEntries: null,
      ...locked,
    };
  }
  const picked = pickWeightedWinner(rows, random);
  return {
    alreadyLocked: false,
    ...picked,
  };
}

export function secureUnitRandom() {
  return randomInt(0, 2 ** 48) / 2 ** 48;
}

/**
 * Pick 1 row with probability proportional to entries.
 * Eligible = in-window mint (refCode) + finished /go + entries ≥ 1 + not fraudFlag.
 * On-camera: POST /api/users/contest/draw with an admin Bearer token.
 */
export function pickWeightedWinner(rows, random = secureUnitRandom) {
  const eligible = (rows || []).filter(isDrawEligible);
  const totalEntries = eligible.reduce(
    (sum, row) => sum + (Number(row.entries) || 0),
    0
  );
  if (totalEntries <= 0) {
    return { winner: null, eligibleCount: eligible.length, totalEntries: 0 };
  }
  let ticket = random() * totalEntries;
  for (const row of eligible) {
    ticket -= Number(row.entries) || 0;
    if (ticket <= 0) {
      return { winner: row, eligibleCount: eligible.length, totalEntries };
    }
  }
  return {
    winner: eligible[eligible.length - 1],
    eligibleCount: eligible.length,
    totalEntries,
  };
}
