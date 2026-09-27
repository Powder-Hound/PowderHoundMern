import mongoose from "mongoose";

function escapeRegex(value) {
  return String(value ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Helio-style named segment predicates for native PowAlert CRM.
 * Each helper returns a Mongo clause. Combined with $and by the query builder.
 *
 * Contest / IG query #49 field names if those keys exist on a Mongo row.
 * Do not add those fields to the User schema from this module.
 */
export const SEGMENT_PREDICATE_IDS = [
  "followsResort",
  "pass",
  "emailMarketingConsent",
  "hasEmail",
  "contest",
  "ig",
];

export const SKI_PASSES = ["Epic", "Ikon", "Indy", "MountainCollective"];

export function parseBoolQuery(value) {
  if (value === true || value === "true" || value === 1 || value === "1") {
    return true;
  }
  if (value === false || value === "false" || value === 0 || value === "0") {
    return false;
  }
  return null;
}

export function isMongoObjectIdString(value) {
  const text = String(value ?? "").trim();
  return /^[a-fA-F0-9]{24}$/.test(text);
}

export function resortNameToSlug(name) {
  return String(name ?? "")
    .trim()
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function firstPresent(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return value;
    }
  }
  return undefined;
}

export function predicateFollowsResort(resortId) {
  return { "resortPreference.resorts": resortId };
}

export function predicatePass(pass) {
  if (!SKI_PASSES.includes(pass)) {
    return {
      ok: false,
      status: 400,
      message: `pass must be one of ${SKI_PASSES.join(", ")}`,
    };
  }
  return {
    ok: true,
    clause: { [`resortPreference.skiPass.${pass}`]: true },
  };
}

export function predicateEmailMarketingConsent(consented) {
  return consented
    ? { emailMarketingConsent: true }
    : { emailMarketingConsent: { $ne: true } };
}

/** Non-empty email address (trim-aware at query time via $gt / empty-or-missing). */
export function predicateHasEmail(hasEmail) {
  if (hasEmail) {
    return { email: { $gt: "" } };
  }
  return {
    $or: [{ email: { $exists: false } }, { email: null }, { email: "" }],
  };
}

/**
 * Contest cohort using unmerged #49 shapes (refCode / entries /
 * contestEnteredAt / baseEntryGranted). No schema invention.
 */
export function predicateContest(entered) {
  if (entered) {
    return {
      $or: [
        { refCode: { $exists: true, $nin: [null, ""] } },
        { entries: { $gt: 0 } },
        { contestEnteredAt: { $ne: null } },
        { baseEntryGranted: true },
      ],
    };
  }
  return {
    $and: [
      { $or: [{ refCode: { $exists: false } }, { refCode: "" }, { refCode: null }] },
      { $or: [{ entries: { $exists: false } }, { entries: 0 }, { entries: null }] },
      { $or: [{ contestEnteredAt: { $exists: false } }, { contestEnteredAt: null }] },
      { baseEntryGranted: { $ne: true } },
    ],
  };
}

/**
 * Instagram using #49 followClaims.network=instagram plus optional
 * direct handle fields if a row already has them. No schema invention.
 */
export function predicateIg(hasIg) {
  if (hasIg) {
    return {
      $or: [
        { instagramHandle: { $exists: true, $nin: [null, ""] } },
        { igHandle: { $exists: true, $nin: [null, ""] } },
        { instagram: { $exists: true, $nin: [null, ""] } },
        { "followClaims.network": "instagram" },
      ],
    };
  }
  return {
    $and: [
      {
        $or: [
          { instagramHandle: { $exists: false } },
          { instagramHandle: "" },
          { instagramHandle: null },
        ],
      },
      { $or: [{ igHandle: { $exists: false } }, { igHandle: "" }, { igHandle: null }] },
      { $or: [{ instagram: { $exists: false } }, { instagram: "" }, { instagram: null }] },
      {
        $or: [
          { followClaims: { $exists: false } },
          { followClaims: { $size: 0 } },
          { "followClaims.network": { $ne: "instagram" } },
        ],
      },
    ],
  };
}

async function defaultFindResort(raw) {
  const { Resort } = await import("../models/resorts.model.js");
  const slug = resortNameToSlug(raw);
  const nameFromSlug = String(raw)
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const exact = await Resort.findOne({
    resortName: new RegExp(`^${escapeRegex(nameFromSlug)}$`, "i"),
  })
    .select("_id resortName")
    .lean();
  if (exact) return exact;

  const named = await Resort.find({}, { resortName: 1 }).lean();
  return (
    named.find((row) => resortNameToSlug(row.resortName) === slug) || null
  );
}

/**
 * Resolve followsResort from a 24-hex ObjectId or a resortName slug
 * (e.g. copper-mountain → Copper Mountain). Inject `findResort` in tests.
 */
export async function resolveFollowsResort(value, { findResort } = {}) {
  const raw = String(value ?? "").trim();
  if (!raw) return { ok: true, id: null };

  if (isMongoObjectIdString(raw)) {
    return { ok: true, id: new mongoose.Types.ObjectId(raw) };
  }

  const finder = findResort ?? defaultFindResort;
  const resort = await finder(raw);
  if (!resort?._id) {
    return {
      ok: false,
      status: 400,
      message: `followsResort not found: ${raw}`,
    };
  }
  return { ok: true, id: resort._id, resortName: resort.resortName || "" };
}

/**
 * Build named predicate clauses from query params. Search `q` is CRM
 * list search, not a Helio segment, and is composed by buildCrmFilter.
 */
export async function buildSegmentQuery(query = {}, options = {}) {
  const applied = [];
  const clauses = [];

  const follows = firstPresent(query.followsResort, query.resort);
  if (follows !== undefined) {
    const resolved = await resolveFollowsResort(follows, options);
    if (!resolved.ok) return resolved;
    clauses.push(predicateFollowsResort(resolved.id));
    applied.push({
      id: "followsResort",
      value: String(follows),
      resortId: String(resolved.id),
    });
  }

  if (query.pass) {
    const built = predicatePass(query.pass);
    if (!built.ok) return built;
    clauses.push(built.clause);
    applied.push({ id: "pass", value: query.pass });
  }

  const consentRaw = firstPresent(
    query.emailMarketingConsent,
    query.emailConsented
  );
  if (consentRaw !== undefined) {
    const consented = parseBoolQuery(consentRaw);
    if (consented === null) {
      return {
        ok: false,
        status: 400,
        message: "emailMarketingConsent must be true or false",
      };
    }
    clauses.push(predicateEmailMarketingConsent(consented));
    applied.push({ id: "emailMarketingConsent", value: consented });
  }

  if (query.hasEmail !== undefined && query.hasEmail !== "") {
    const hasEmail = parseBoolQuery(query.hasEmail);
    if (hasEmail === null) {
      return {
        ok: false,
        status: 400,
        message: "hasEmail must be true or false",
      };
    }
    clauses.push(predicateHasEmail(hasEmail));
    applied.push({ id: "hasEmail", value: hasEmail });
  }

  if (query.contest !== undefined && query.contest !== "") {
    const entered = parseBoolQuery(query.contest);
    if (entered === null) {
      return { ok: false, status: 400, message: "contest must be true or false" };
    }
    clauses.push(predicateContest(entered));
    applied.push({ id: "contest", value: entered });
  }

  if (query.ig !== undefined && query.ig !== "") {
    const hasIg = parseBoolQuery(query.ig);
    if (hasIg === null) {
      return { ok: false, status: 400, message: "ig must be true or false" };
    }
    clauses.push(predicateIg(hasIg));
    applied.push({ id: "ig", value: hasIg });
  }

  return { ok: true, clauses, applied };
}
