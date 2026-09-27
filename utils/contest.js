import { createHash, randomBytes, randomInt } from "node:crypto";
import { User } from "../models/users.model.js";
import { PhoneOtpVerification } from "../models/phoneOtpVerification.model.js";
import { digitsPhone } from "./phone.js";

/**
 * One Extra Storm — unique-link + signup tracking.
 *
 * Contest window comes from env (ISO 8601), not a hard-coded calendar:
 *   CONTEST_START_AT
 *   CONTEST_END_AT
 * If either is missing or invalid, the contest is not running and no
 * entries or referral credits are granted.
 *
 * Public unique link: https://powalert.com/go?ref={CODE}
 * Also accepted:      https://powalert.com/go?from=win&ref=CODE
 * Persist field: `ref` or `referredBy` (same code).
 *
 * Scoring (only while the window is running):
 *   - Non-referred finished /go: +1 base entry + refCode
 *   - Signup through a referral link: 5 entries for the new user (not 1+5)
 *   - Referrer: +10 when that referred user completes phone OTP
 *     Unverified referred signups credit the referrer nothing.
 *   - Honor-system follows: +1 per network, max 4
 *
 * Finished /go outside the window still persists the watch.
 * Rows that already minted inside the window stay draw-eligible after close
 * if not fraudFlag. Cron off.
 *
 * Prize (do not implement payment): one 2026/27 adult Epic or Ikon.
 * No Gleam. No OAuth. Cron stays off.
 */

export const CONTEST_BASE_ENTRIES = 1;
export const CONTEST_REFERRED_SIGNUP_ENTRIES = 5;
export const CONTEST_REFERRER_OTP_ENTRIES = 10;
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
  "referralCreditClosed",
  "baseEntryGranted",
  "referredSignupEntriesGranted",
  "referredSignupAttachedAt",
  "referredSignupChecked",
  "phoneOtpVerifiedAt",
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

function asDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Read CONTEST_START_AT / CONTEST_END_AT. Missing or invalid → not configured.
 * Comparison is absolute (the ISO timestamps), inclusive on both ends.
 */
export function parseContestWindow(env = process.env) {
  const startRaw = String(env.CONTEST_START_AT ?? "").trim();
  const endRaw = String(env.CONTEST_END_AT ?? "").trim();
  if (!startRaw || !endRaw) {
    return { configured: false, start: null, end: null, reason: "unset" };
  }
  const start = asDate(startRaw);
  const end = asDate(endRaw);
  if (!start || !end || start.getTime() >= end.getTime()) {
    return { configured: false, start: null, end: null, reason: "invalid" };
  }
  return {
    configured: true,
    start,
    end,
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  };
}

export function isContestRunning(now = new Date(), env = process.env) {
  const window = parseContestWindow(env);
  if (!window.configured) return false;
  const t = asDate(now);
  if (!t) return false;
  return t.getTime() >= window.start.getTime() && t.getTime() <= window.end.getTime();
}

export function contestScoring() {
  return {
    baseEntries: CONTEST_BASE_ENTRIES,
    referredSignupEntries: CONTEST_REFERRED_SIGNUP_ENTRIES,
    referrerEntriesPerVerifiedSignup: CONTEST_REFERRER_OTP_ENTRIES,
    followExtraPerNetwork: FOLLOW_EXTRA_PER_NETWORK,
    followExtraMax: FOLLOW_EXTRA_MAX,
  };
}

/** Public SPA contract for GET /api/contest/config. */
export function contestPublicConfig(now = new Date(), env = process.env) {
  const window = parseContestWindow(env);
  return {
    success: true,
    running: isContestRunning(now, env),
    configured: window.configured,
    window: {
      start: window.startIso ?? null,
      end: window.endIso ?? null,
    },
    scoring: contestScoring(),
    shareOrigin: CONTEST_SHARE_ORIGIN,
    refCode: {
      alphabet: REF_CODE.alphabet,
      length: REF_CODE.length,
    },
  };
}

export function contestWindowMeta(now = new Date(), env = process.env) {
  const config = contestPublicConfig(now, env);
  return {
    running: config.running,
    configured: config.configured,
    start: config.window.start,
    end: config.window.end,
    ...config.scoring,
  };
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

export function phoneOtpVerifiedAt(user, override) {
  return asDate(override ?? user?.phoneOtpVerifiedAt ?? null);
}

/**
 * Referrer +10. Only after the referred user's phone OTP is verified,
 * once, inside the window. Unverified signups credit nothing.
 * Re-verify and self-referral do not credit again.
 */
export function shouldCreditReferrer({
  user,
  referrer,
  verifiedAt = null,
} = {}) {
  if (user?.referralCredited) {
    return { ok: false, reason: "already_credited" };
  }
  if (user?.referralCreditClosed) {
    return { ok: false, reason: "credit_closed" };
  }
  if (!user?.referralCreditEligible) {
    return { ok: false, reason: "phone_already_existed" };
  }
  if (!user?.referredBy) {
    return { ok: false, reason: "no_referred_by" };
  }
  const verified = phoneOtpVerifiedAt(user, verifiedAt);
  if (!verified) {
    return { ok: false, reason: "otp_not_verified" };
  }
  if (!isContestRunning(verified)) {
    return { ok: false, reason: "outside_window" };
  }
  if (!referrer?.refCode) {
    return { ok: false, reason: "referrer_not_found" };
  }
  if (referrer.refCode !== user.referredBy) {
    return { ok: false, reason: "code_mismatch" };
  }
  if (isSelfReferral({ user, referrer, referredBy: user.referredBy })) {
    return { ok: false, reason: "self_referral" };
  }
  return {
    ok: true,
    reason: "credited",
    entries: CONTEST_REFERRER_OTP_ENTRIES,
  };
}

export function shouldCreditReferral(args) {
  return shouldCreditReferrer(args);
}

/**
 * The referred user's own 5 entries, granted once when the referral code
 * is first attached inside the window. Replaces the +1 base (not 1+5).
 */
export function planReferredSignupEntries({
  user,
  referrer = null,
  referralJustAttached = false,
  now = new Date(),
} = {}) {
  if (!user?.referredBy) {
    return { grant: false, reason: "no_referred_by", userSet: {} };
  }
  if (user.referredSignupEntriesGranted) {
    return { grant: false, reason: "already_granted", userSet: {} };
  }
  if (user.referredSignupChecked && !referralJustAttached) {
    return { grant: false, reason: "already_checked", userSet: {} };
  }

  const attachedAt = user.referredSignupAttachedAt
    ? asDate(user.referredSignupAttachedAt)
    : referralJustAttached
      ? asDate(now)
      : null;
  if (!attachedAt) {
    return { grant: false, reason: "not_attached_now", userSet: {} };
  }

  const userSet = {};
  if (!user.referredSignupAttachedAt && referralJustAttached) {
    userSet.referredSignupAttachedAt = attachedAt;
  }

  const close = (reason) => {
    userSet.referredSignupChecked = true;
    return { grant: false, reason, userSet };
  };

  if (!isContestRunning(attachedAt)) {
    // The referral signup itself was outside the window, so it does not
    // earn the 5 and does not fall through to the non-referred +1.
    userSet.baseEntryGranted = true;
    return close("outside_window");
  }
  if (!referrer?.refCode || referrer.refCode !== user.referredBy) {
    return close("referrer_not_found");
  }
  if (isSelfReferral({ user, referrer, referredBy: user.referredBy })) {
    userSet.baseEntryGranted = true;
    return close("self_referral");
  }

  userSet.referredSignupChecked = true;
  userSet.referredSignupEntriesGranted = true;
  userSet.baseEntryGranted = true;
  userSet.entries =
    (Number(user.entries) || 0) + CONTEST_REFERRED_SIGNUP_ENTRIES;
  return {
    grant: true,
    reason: "granted",
    entries: CONTEST_REFERRED_SIGNUP_ENTRIES,
    userSet,
  };
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
  referralJustAttached = false,
  otpVerifiedAt = null,
} = {}) {
  const userSet = {};
  if (ipHash && ipHash !== user.ipHash) {
    userSet.ipHash = ipHash;
  }

  const verified = phoneOtpVerifiedAt(user, otpVerifiedAt);
  if (verified && !user.phoneOtpVerifiedAt) {
    userSet.phoneOtpVerifiedAt = verified;
  }

  const merged = { ...user, ...userSet };
  const finished = isFinishedGo(merged);
  const inWindow = isContestRunning(now);

  const referred = planReferredSignupEntries({
    user: merged,
    referrer,
    referralJustAttached,
    now,
  });
  Object.assign(userSet, referred.userSet);

  // refCode still mints only on a finished /go inside the window.
  if (finished && inWindow && !user.refCode && !userSet.refCode) {
    userSet.refCode = mintRefCode();
    userSet.contestEnteredAt = now instanceof Date ? now : new Date(now);
  }

  // Non-referred finished /go keeps today's +1. A referred signup's 5
  // replaces that base (baseEntryGranted is set with the 5). Self-referral
  // and an out-of-window referral attach also suppress the base.
  const suppressBase = Boolean(
    user.baseEntryGranted ||
      userSet.baseEntryGranted ||
      user.referredSignupEntriesGranted ||
      userSet.referredSignupEntriesGranted ||
      referred.reason === "self_referral" ||
      referred.reason === "outside_window" ||
      referred.reason === "already_granted"
  );
  if (finished && inWindow && !suppressBase) {
    if (!user.refCode) {
      const current =
        userSet.entries !== undefined
          ? Number(userSet.entries)
          : Number(user.entries) || 0;
      userSet.entries = current + CONTEST_BASE_ENTRIES;
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
    phoneOtpVerifiedAt: userSet.phoneOtpVerifiedAt || user.phoneOtpVerifiedAt,
  };
  const credit = shouldCreditReferrer({
    user: creditUser,
    referrer,
    verifiedAt: verified,
  });

  // The +10 only counts when the referred signup itself counted (the 5).
  // A signup attached outside the window cannot be credited later.
  // Idempotency is referralCredited (atomic in applyContestOnUserSave).
  void wasAlreadyFinished;
  const signupCounted = Boolean(
    user.referredSignupEntriesGranted || userSet.referredSignupEntriesGranted
  );
  const signupDecided = Boolean(
    signupCounted || user.referredSignupChecked || userSet.referredSignupChecked
  );
  const referrerInc =
    credit.ok && signupCounted
      ? {
          entries: CONTEST_REFERRER_OTP_ENTRIES,
          referredCompleteCount: 1,
        }
      : null;
  if (
    credit.reason === "outside_window" ||
    credit.reason === "self_referral" ||
    (credit.ok && signupDecided && !signupCounted)
  ) {
    userSet.referralCreditClosed = true;
  }

  return {
    userSet,
    referrerInc,
    creditReason: credit.reason,
    referredSignupReason: referred.reason,
    shareUrl: contestShareUrl(userSet.refCode || user.refCode),
  };
}

export async function lookupPhoneOtpVerifiedAt(phoneNumber) {
  const digits = digitsPhone(phoneNumber);
  if (!digits) return null;
  const record = await PhoneOtpVerification.findOne({ phoneNumber: digits });
  return asDate(record?.verifiedAt);
}

/**
 * First successful OTP wins. Re-verify does not move verifiedAt.
 * If the user row already exists, contest credit runs immediately.
 */
export async function recordPhoneOtpVerified(phone, now = new Date()) {
  const digits = digitsPhone(phone);
  if (!digits) return null;
  const when = asDate(now) || new Date();
  let record;
  try {
    record = await PhoneOtpVerification.findOneAndUpdate(
      { phoneNumber: digits },
      { $setOnInsert: { phoneNumber: digits, verifiedAt: when } },
      { upsert: true, new: true }
    );
  } catch (error) {
    if (error?.code === 11000) {
      record = await PhoneOtpVerification.findOne({ phoneNumber: digits });
    } else {
      throw error;
    }
  }

  const user = await User.findOne({
    $or: [{ phoneNumber: digits }, { phoneNumber: `+${digits}` }],
  });
  if (user) {
    await applyContestOnUserSave({
      user,
      wasAlreadyFinished: isFinishedGo(user),
      now: new Date(),
    });
  }
  return record;
}

export async function applyContestOnUserSave({
  user,
  wasAlreadyFinished = false,
  clientIp = "",
  now = new Date(),
  referralJustAttached = false,
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

  let otpVerifiedAt = phoneOtpVerifiedAt(plain);
  if (!otpVerifiedAt) {
    otpVerifiedAt = await lookupPhoneOtpVerifiedAt(plain.phoneNumber);
  }

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
    referralJustAttached,
    otpVerifiedAt,
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
      {
        _id: user._id,
        referralCredited: { $ne: true },
        referralCreditClosed: { $ne: true },
      },
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
  if (!isContestRunning(now)) {
    return {
      ok: true,
      noop: true,
      reason: "outside_window",
      entriesDelta: 0,
      followClaims: user?.followClaims || [],
    };
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
