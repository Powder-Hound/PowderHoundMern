import { digitsPhone } from "./phone.js";
import { normalizeEmail } from "./email.js";
import {
  SEGMENT_PREDICATE_IDS,
  SKI_PASSES,
  buildSegmentQuery,
} from "./segmentPredicates.js";

export { SEGMENT_PREDICATE_IDS, SKI_PASSES };
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
      .split(",")
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

function combineClauses(clauses) {
  if (clauses.length === 0) return {};
  if (clauses.length === 1) return clauses[0];
  return { $and: clauses };
}

/**
 * Compose Helio-style segment predicates + optional `q` search.
 * List and CSV both call this so export matches the filter UI.
 */
export async function buildCrmFilter(query = {}, options = {}) {
  const segment = await buildSegmentQuery(query, options);
  if (!segment.ok) return segment;

  const and = [...segment.clauses];

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

  return {
    ok: true,
    filter: combineClauses(and),
    applied: segment.applied,
    predicates: SEGMENT_PREDICATE_IDS,
  };
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
  "followsResort",
  "resort",
  "pass",
  "contest",
  "ig",
  "emailMarketingConsent",
  "emailConsented",
  "hasEmail",
  "page",
  "limit",
];
