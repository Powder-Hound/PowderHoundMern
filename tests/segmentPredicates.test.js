import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import mongoose from "mongoose";
import { User } from "../models/users.model.js";
import {
  SEGMENT_PREDICATE_IDS,
  buildSegmentQuery,
  isMongoObjectIdString,
  predicateContest,
  predicateEmailMarketingConsent,
  predicateFollowsResort,
  predicateHasEmail,
  predicateIg,
  predicatePass,
  resortNameToSlug,
  resolveFollowsResort,
} from "../utils/segmentPredicates.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const copperId = new mongoose.Types.ObjectId();

const findResort = async (raw) => {
  if (resortNameToSlug(raw) === "copper-mountain" || raw === "Copper Mountain") {
    return { _id: copperId, resortName: "Copper Mountain" };
  }
  return null;
};

describe("Helio-style segment predicates", () => {
  it("exports the Phase A predicate ids", () => {
    assert.deepEqual(SEGMENT_PREDICATE_IDS, [
      "followsResort",
      "pass",
      "emailMarketingConsent",
      "hasEmail",
      "contest",
      "ig",
    ]);
  });

  it("builds followsResort from ObjectId without a resort lookup", async () => {
    const id = new mongoose.Types.ObjectId();
    const resolved = await resolveFollowsResort(String(id), {
      findResort: async () => {
        throw new Error("should not look up ObjectIds");
      },
    });
    assert.equal(String(resolved.id), String(id));
    assert.deepEqual(predicateFollowsResort(resolved.id), {
      "resortPreference.resorts": resolved.id,
    });
  });

  it("resolves followsResort slugs and names via the resort finder", async () => {
    const bySlug = await resolveFollowsResort("copper-mountain", { findResort });
    const byName = await resolveFollowsResort("Copper Mountain", { findResort });
    assert.equal(String(bySlug.id), String(copperId));
    assert.equal(String(byName.id), String(copperId));
    assert.equal(isMongoObjectIdString("copper-mountain"), false);
    assert.equal(resortNameToSlug("Winter Park Resort"), "winter-park-resort");
  });

  it("rejects an unknown followsResort slug", async () => {
    const parsed = await buildSegmentQuery(
      { followsResort: "not-a-hill" },
      { findResort }
    );
    assert.equal(parsed.ok, false);
    assert.equal(parsed.status, 400);
  });

  it("builds pass / consent / hasEmail clauses", () => {
    assert.deepEqual(predicatePass("Ikon").clause, {
      "resortPreference.skiPass.Ikon": true,
    });
    assert.equal(predicatePass("IkonPlus").ok, false);
    assert.deepEqual(predicateEmailMarketingConsent(true), {
      emailMarketingConsent: true,
    });
    assert.deepEqual(predicateHasEmail(true), { email: { $gt: "" } });
    assert.ok(Array.isArray(predicateHasEmail(false).$or));
  });

  it("ANDs Helio predicates including v1 aliases", async () => {
    const parsed = await buildSegmentQuery(
      {
        followsResort: "copper-mountain",
        pass: "Epic",
        emailConsented: "true",
        hasEmail: "true",
        contest: "true",
        ig: "true",
      },
      { findResort }
    );
    assert.equal(parsed.ok, true);
    assert.equal(parsed.clauses.length, 6);
    assert.deepEqual(
      parsed.applied.map((item) => item.id),
      SEGMENT_PREDICATE_IDS
    );
    assert.ok(
      parsed.clauses.some(
        (clause) => clause["resortPreference.skiPass.Epic"] === true
      )
    );
    assert.ok(
      parsed.clauses.some((clause) => clause.emailMarketingConsent === true)
    );
    assert.ok(parsed.clauses.some((clause) => clause.email?.$gt === ""));
  });
});

describe("contest / IG predicates stay compatible with #49 without schema invention", () => {
  it("does not add contest or IG fields to the User schema", () => {
    assert.equal(User.schema.path("refCode"), undefined);
    assert.equal(User.schema.path("entries"), undefined);
    assert.equal(User.schema.path("followClaims"), undefined);
    assert.equal(User.schema.path("instagramHandle"), undefined);
    assert.equal(User.schema.path("contestEnteredAt"), undefined);
    const model = readFileSync(join(root, "models/users.model.js"), "utf8");
    assert.doesNotMatch(model, /refCode/);
    assert.doesNotMatch(model, /followClaims/);
    assert.doesNotMatch(model, /instagramHandle/);
  });

  it("queries #49 contest/IG shapes when those filters are requested", () => {
    const contest = predicateContest(true);
    assert.ok(contest.$or.some((item) => item.refCode));
    assert.ok(contest.$or.some((item) => item.baseEntryGranted === true));
    const ig = predicateIg(true);
    assert.ok(
      ig.$or.some((item) => item["followClaims.network"] === "instagram")
    );
  });
});
