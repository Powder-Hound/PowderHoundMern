import mongoose from "mongoose";
import { digitsPhone } from "./phone.js";
import { normalizeEmail } from "./email.js";

export const SKI_PASSES = ["Epic", "Ikon", "Indy", "MountainCollective"];
export const CRM_PAGE_DEFAULT = 50;
export const CRM_PAGE_MAX = 200;
export const CRM_EXPORT_MAX = 10000;

export const CRM_CSV_COLUMNS = [
  "id",
  "name",
  "phone",
  "email",
  "emailMarketingConsent",
  "emailMarketingConsentAt",
  "emailSource",
  "passes",
  "followedResorts",
  "stickPreferred",
  "stickAny",
  "stickPeriod",
  "stickUom",
  "createdAt",
  "verifiedProxy",
  "contestStatus",
  "contestEntries",
  "refCode",
  "instagramHandle",
];

export function parseAdminPhoneAllowlist(
  raw = process.env.ADMIN_PHONE_ALLOWLIST
) {
  return new Set(
    String(raw ?? "")
      .split(/[,\s]+/)
      .map((value) => digitsPhone(value))
      .filter(Boolean)
  );
}

export function isOnAdminAllowlist(phoneNumber, allowlist) {
  const digits = digitsPhone(phoneNumber);
  return Boolean(digits && allowlist?.has(digits));
}

export function escapeRegex(value) {
  return String(value ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function passesFromUser(user = {}) {
  const skiPass = user.resortPreference?.skiPass ?? {};
  return SKI_PASSES.filter((key) => Boolean(skiPass[key]));
}

export function stickFromUser(user = {}) {
  const threshold = user.alertThreshold ?? {};
  return {
    preferredResorts: threshold.preferredResorts ?? null,
    anyResort: threshold.anyResort ?? null,
    snowfallPeriod: threshold.snowfallPeriod ?? null,
    uom: threshold.uom ?? null,
  };
}

export function instagramHandleFromUser(user = {}) {
  const direct = String(
    user.instagramHandle || user.igHandle || user.instagram || ""
  ).trim();
  if (direct) return direct;
  const claims = Array.isArray(user.followClaims) ? user.followClaims : [];
  const ig = claims.find(
    (claim) => claim?.network === "instagram" && String(claim.handle || "").trim()
  );
  return ig ? String(ig.handle).trim() : "";
}

/**
 * Contest fields live on unmerged One Extra Storm work (PR #49), not main.
 * CRM reads them if present on the Mongo row.
 */
export function contestStatusFromUser(user = {}) {
  if (user.fraudFlag) return "flagged";
  if (user.contestDrawLocked) return "drawn";
  if (
    user.refCode ||
    user.baseEntryGranted ||
    user.contestEnteredAt ||
    Number(user.entries) > 0
  ) {
    return "entered";
  }
  return "";
}

export function followedResortIds(user = {}) {
  const resorts = user.resortPreference?.resorts;
  if (!Array.isArray(resorts)) return [];
  return resorts.map((id) => String(id));
}

export function toCrmRow(user = {}) {
  const stick = stickFromUser(user);
  return {
    id: user._id ? String(user._id) : "",
    name: user.name || "",
    phone: user.phoneNumber || "",
    email: normalizeEmail(user.email),
    emailMarketingConsent: Boolean(user.emailMarketingConsent),
    emailMarketingConsentAt: user.emailMarketingConsentAt ?? null,
    emailSource: user.emailSource || "",
    passes: passesFromUser(user),
    followedResorts: followedResortIds(user),
    stick,
    createdAt: user.createdAt ?? null,
    verifiedProxy: Boolean(user.phoneVerifySID),
    contestStatus: contestStatusFromUser(user),
    contestEntries: Number(user.entries) || 0,
    refCode: user.refCode || "",
    instagramHandle: instagramHandleFromUser(user),
  };
}

export function buildCrmFilter(query = {}) {
  const filter = {};
  const and = [];

  const q = String(query.q ?? "").trim();
  if (q) {
    const digits = digitsPhone(q);
    const rx = new RegExp(escapeRegex(q), "i");
    const searchOr = [{ name: rx }, { email: rx }];
    if (digits) {
      searchOr.push({ phoneNumber: new RegExp(escapeRegex(digits)) });
    }
    and.push({ $or: searchOr });
  }

  if (query.resort) {
    try {
      and.push({
        "resortPreference.resorts": new mongoose.Types.ObjectId(
          String(query.resort)
        ),
      });
    } catch {
      return { ok: false, status: 400, message: "resort must be a Mongo ObjectId" };
    }
  }

  if (query.pass) {
    if (!SKI_PASSES.includes(query.pass)) {
      return {
        ok: false,
        status: 400,
        message: `pass must be one of ${SKI_PASSES.join(", ")}`,
      };
    }
    and.push({ [`resortPreference.skiPass.${query.pass}`]: true });
  }

  if (query.contest === "true" || query.contest === true) {
    and.push({
      $or: [
        { refCode: { $exists: true, $nin: [null, ""] } },
        { entries: { $gt: 0 } },
        { contestEnteredAt: { $ne: null } },
        { baseEntryGranted: true },
      ],
    });
  } else if (query.contest === "false" || query.contest === false) {
    and.push({
      $and: [
        { $or: [{ refCode: { $exists: false } }, { refCode: "" }, { refCode: null }] },
        { $or: [{ entries: { $exists: false } }, { entries: 0 }, { entries: null }] },
        { $or: [{ contestEnteredAt: { $exists: false } }, { contestEnteredAt: null }] },
        { baseEntryGranted: { $ne: true } },
      ],
    });
  }

  if (query.ig === "true" || query.ig === true) {
    and.push({
      $or: [
        { instagramHandle: { $exists: true, $nin: [null, ""] } },
        { igHandle: { $exists: true, $nin: [null, ""] } },
        { instagram: { $exists: true, $nin: [null, ""] } },
        { "followClaims.network": "instagram" },
      ],
    });
  } else if (query.ig === "false" || query.ig === false) {
    and.push({
      $and: [
        {
          $or: [
            { instagramHandle: { $exists: false } },
            { instagramHandle: "" },
            { instagramHandle: null },
          ],
        },
        { $or: [{ igHandle: { $exists: false } }, { igHandle: "" }, { igHandle: null }] },
        {
          $or: [
            { followClaims: { $exists: false } },
            { followClaims: { $size: 0 } },
            { "followClaims.network": { $ne: "instagram" } },
          ],
        },
      ],
    });
  }

  if (query.emailConsented === "true" || query.emailConsented === true) {
    and.push({ emailMarketingConsent: true });
  } else if (
    query.emailConsented === "false" ||
    query.emailConsented === false
  ) {
    and.push({ emailMarketingConsent: { $ne: true } });
  }

  if (and.length === 1) {
    Object.assign(filter, and[0]);
  } else if (and.length > 1) {
    filter.$and = and;
  }

  return { ok: true, filter };
}

export function parseCrmPaging(query = {}, { exportAll = false } = {}) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const requested = parseInt(query.limit, 10);
  const cap = exportAll ? CRM_EXPORT_MAX : CRM_PAGE_MAX;
  const fallback = exportAll ? CRM_EXPORT_MAX : CRM_PAGE_DEFAULT;
  const limit = Math.min(cap, requested > 0 ? requested : fallback);
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

export function csvCell(value) {
  const text = Array.isArray(value)
    ? value.join("|")
    : value instanceof Date
      ? value.toISOString()
      : String(value ?? "");
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function crmRowsToCsv(rows = []) {
  const header = CRM_CSV_COLUMNS.join(",");
  const lines = rows.map((row) =>
    CRM_CSV_COLUMNS.map((col) => {
      if (col === "stickPreferred") return csvCell(row.stick?.preferredResorts);
      if (col === "stickAny") return csvCell(row.stick?.anyResort);
      if (col === "stickPeriod") return csvCell(row.stick?.snowfallPeriod);
      if (col === "stickUom") return csvCell(row.stick?.uom);
      if (col === "passes" || col === "followedResorts") {
        return csvCell(row[col]);
      }
      return csvCell(row[col]);
    }).join(",")
  );
  return [header, ...lines].join("\n");
}

export const CRM_PUBLIC_QUERY_KEYS = [
  "q",
  "resort",
  "pass",
  "contest",
  "ig",
  "emailConsented",
  "page",
  "limit",
];
