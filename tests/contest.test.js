import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import mongoose from "mongoose";
import { User } from "../models/users.model.js";
import { digitsPhone } from "../utils/phone.js";
import {
  ADMIN_CSV_COLUMNS,
  CONTEST_END_LOCAL,
  CONTEST_REFERRAL_ENTRIES,
  CONTEST_START_LOCAL,
  CONTEST_TIME_ZONE,
  FOLLOW_EXTRA_MAX,
  FOLLOW_NETWORKS,
  FOLLOW_V1_CONFIRMED,
  REF_CODE,
  SAME_IP_CLUSTER_THRESHOLD,
  adminEntriesToCsv,
  contestShareUrl,
  denverDateTime,
  extractRefCode,
  detectFraud,
  hashIp,
  isDrawEligible,
  isFinishedGo,
  isSelfReferral,
  isUrlSafeRefCode,
  isWithinContestWindow,
  maskPhone,
  mintRefCode,
  pickWeightedWinner,
  planContestAfterSave,
  resolveDraw,
  sameIpInclusiveCount,
  planFollowClaim,
  readReferredBy,
  sanitizeUserWrite,
  shouldCreditReferral,
  stripContestServerFields,
  toAdminRow,
} from "../utils/contest.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const INSIDE_WINDOW = new Date("2026-09-10T18:00:00.000Z"); // 12:00 MDT
const BEFORE_WINDOW = new Date("2026-08-29T12:00:00.000Z");
const AFTER_WINDOW = new Date("2026-09-29T06:00:00.000Z"); // 00:00 MDT Sep 29

const finishedFields = () => ({
  name: "Pat",
  phoneVerifySID: "VE_TEST_SID",
  resortPreference: {
    skiPass: {
      Epic: true,
      Ikon: false,
      Indy: false,
      MountainCollective: false,
    },
    resorts: [new mongoose.Types.ObjectId()],
  },
  alertThreshold: {
    preferredResorts: 12,
    anyResort: 18,
    snowfallPeriod: 24,
    uom: "in",
  },
});

const finishedUser = (overrides = {}) => ({
  _id: new mongoose.Types.ObjectId(),
  phoneNumber: "17205550101",
  referralCreditEligible: true,
  referralCredited: false,
  entries: 0,
  referredCompleteCount: 0,
  referredBy: "",
  fraudFlag: false,
  fraudReasons: [],
  ...finishedFields(),
  ...overrides,
});

describe("One Extra Storm stays on the existing users collection", () => {
  it("does not introduce a second users table", () => {
    assert.equal(User.collection.collectionName, "users");
  });

  it("keeps last-season digit-only phoneNumber", () => {
    const user = new User({
      phoneNumber: digitsPhone("+17205550100"),
      phoneVerifySID: "VE_TEST_SID",
    });
    assert.equal(user.phoneNumber, "17205550100");
    assert.equal(user.entries, 0);
    assert.equal(user.refCode, undefined);
    assert.equal(user.referralCreditEligible, false);
    assert.deepEqual(user.followClaims, []);
    assert.equal(user.baseEntryGranted, false);
  });

  it("does not treat a bare phone+SID signup as a finished /go", () => {
    const user = new User({
      phoneNumber: "17205550100",
      phoneVerifySID: "VE_TEST_SID",
    });
    assert.equal(isFinishedGo(user), false);
    const plan = planContestAfterSave({
      user: user.toObject(),
      wasAlreadyFinished: false,
      now: INSIDE_WINDOW,
    });
    assert.equal(plan.userSet.refCode, undefined);
    assert.equal(plan.userSet.entries, undefined);
    assert.equal(plan.referrerInc, null);
  });
});

describe("finished /go eligibility gate", () => {
  it("requires name, pass, ≥1 hill, both sticks, and OTP SID", () => {
    const base = finishedUser();
    assert.equal(isFinishedGo(base), true);
    assert.equal(isFinishedGo({ ...base, name: "  " }), false);
    assert.equal(
      isFinishedGo({
        ...base,
        resortPreference: {
          ...base.resortPreference,
          skiPass: {
            Epic: false,
            Ikon: false,
            Indy: false,
            MountainCollective: false,
          },
        },
      }),
      false
    );
    assert.equal(
      isFinishedGo({
        ...base,
        resortPreference: { ...base.resortPreference, resorts: [] },
      }),
      false
    );
    assert.equal(
      isFinishedGo({
        ...base,
        alertThreshold: { preferredResorts: 12 },
      }),
      false
    );
    assert.equal(isFinishedGo({ ...base, phoneVerifySID: "" }), false);
  });
});

describe("contest window constant (America/Denver)", () => {
  it("documents 8 Sep 00:00 through 28 Sep 23:59 America/Denver", () => {
    assert.equal(CONTEST_TIME_ZONE, "America/Denver");
    assert.equal(CONTEST_START_LOCAL, "2026-09-08T00:00:00");
    assert.equal(CONTEST_END_LOCAL, "2026-09-28T23:59:59");
  });

  it("is closed on 29 Aug 2026 and open on 10 Sep 2026", () => {
    assert.equal(isWithinContestWindow(BEFORE_WINDOW), false);
    assert.equal(isWithinContestWindow(INSIDE_WINDOW), true);
    assert.equal(isWithinContestWindow(AFTER_WINDOW), false);
    assert.equal(denverDateTime(INSIDE_WINDOW).startsWith("2026-09-10"), true);
  });

  it("opens at 8 Sep 2026 00:00 Denver and closes after 28 Sep 23:59 Denver", () => {
    const open = new Date("2026-09-08T06:00:00.000Z"); // 00:00 MDT
    const lastSecond = new Date("2026-09-29T05:59:59.000Z"); // 23:59:59 MDT Sep 28
    const closed = new Date("2026-09-29T06:00:00.000Z"); // 00:00 MDT Sep 29
    assert.equal(isWithinContestWindow(open), true);
    assert.equal(isWithinContestWindow(lastSecond), true);
    assert.equal(isWithinContestWindow(closed), false);
  });

  it("does not mint refCode/base entry or enter the draw pool before the window", () => {
    const a = finishedUser({ phoneNumber: "17205550101", name: "A" });
    const plan = planContestAfterSave({
      user: a,
      wasAlreadyFinished: false,
      now: BEFORE_WINDOW,
    });
    assert.equal(plan.userSet.refCode, undefined);
    assert.equal(plan.userSet.entries, undefined);
    assert.equal(plan.userSet.baseEntryGranted, undefined);
    assert.equal(plan.referrerInc, null);
    assert.equal(
      isDrawEligible({ ...a, ...plan.userSet }),
      false
    );
  });

  it("mints +1 inside the window and keeps in-window rows eligible after close", () => {
    const a = finishedUser({ phoneNumber: "17205550101", name: "A" });
    const plan = planContestAfterSave({
      user: a,
      wasAlreadyFinished: false,
      now: INSIDE_WINDOW,
    });
    assert.ok(plan.userSet.refCode);
    assert.equal(plan.userSet.entries, 1);
    const inWindowRow = {
      ...a,
      ...plan.userSet,
    };
    assert.equal(isDrawEligible(inWindowRow), true);

    const after = planContestAfterSave({
      user: finishedUser({ name: "Late" }),
      wasAlreadyFinished: false,
      now: AFTER_WINDOW,
    });
    assert.equal(after.userSet.refCode, undefined);
    assert.equal(after.userSet.entries, undefined);
    assert.equal(
      isDrawEligible({
        ...inWindowRow,
        now: AFTER_WINDOW,
      }),
      true
    );
    assert.equal(
      isDrawEligible({ ...inWindowRow, fraudFlag: true }),
      false
    );
  });
});

describe("two-user unique-link flow (A finishes → CODE; B finishes → A.entries += 5)", () => {
  it("mints a short URL-safe refCode and 1 base entry when A finishes /go", () => {
    const a = finishedUser({ phoneNumber: "17205550101", name: "A" });
    const planA = planContestAfterSave({
      user: a,
      wasAlreadyFinished: false,
      now: INSIDE_WINDOW,
    });
    assert.ok(planA.userSet.refCode);
    assert.equal(isUrlSafeRefCode(planA.userSet.refCode), true);
    assert.equal(planA.userSet.refCode.length, REF_CODE.length);
    assert.equal(planA.userSet.entries, 1);
    assert.equal(planA.referrerInc, null);
    assert.equal(
      contestShareUrl(planA.userSet.refCode),
      `https://powalert.com/go?ref=${planA.userSet.refCode}`
    );
  });

  it("credits A +5 when B finishes /go with referredBy=CODE inside the window", () => {
    const a = finishedUser({
      phoneNumber: "17205550101",
      name: "A",
      refCode: "Ab3Cd4Ef",
      entries: 1,
    });
    const b = finishedUser({
      phoneNumber: "17205550102",
      name: "B",
      referredBy: "Ab3Cd4Ef",
      referralCreditEligible: true,
    });
    const planB = planContestAfterSave({
      user: b,
      referrer: a,
      wasAlreadyFinished: false,
      now: INSIDE_WINDOW,
    });
    assert.equal(planB.userSet.entries, 1);
    assert.ok(planB.userSet.refCode);
    assert.equal(planB.referrerInc.entries, CONTEST_REFERRAL_ENTRIES);
    assert.equal(planB.referrerInc.referredCompleteCount, 1);
    assert.equal(planB.creditReason, "credited");
    assert.equal(a.entries + planB.referrerInc.entries, 6);
  });

  it("does not credit a page view or unfinished persist", () => {
    const a = finishedUser({
      refCode: "Ab3Cd4Ef",
      entries: 1,
      name: "A",
    });
    const b = {
      ...finishedUser({
        phoneNumber: "17205550102",
        referredBy: "Ab3Cd4Ef",
        name: "",
      }),
    };
    const plan = planContestAfterSave({
      user: b,
      referrer: a,
      wasAlreadyFinished: false,
      now: INSIDE_WINDOW,
    });
    assert.equal(plan.referrerInc, null);
    assert.equal(plan.userSet.refCode, undefined);
    assert.equal(shouldCreditReferral({
      user: b,
      referrer: a,
      now: INSIDE_WINDOW,
    }).reason, "not_finished");
  });

  it("does not credit outside the Denver window, on self-ref, or when the phone already existed", () => {
    const a = finishedUser({
      refCode: "Ab3Cd4Ef",
      entries: 1,
      name: "A",
      phoneNumber: "17205550101",
    });

    const outside = shouldCreditReferral({
      user: finishedUser({ referredBy: "Ab3Cd4Ef" }),
      referrer: a,
      now: BEFORE_WINDOW,
    });
    assert.equal(outside.ok, false);
    assert.equal(outside.reason, "outside_window");

    const existingPhone = shouldCreditReferral({
      user: finishedUser({
        referredBy: "Ab3Cd4Ef",
        referralCreditEligible: false,
      }),
      referrer: a,
      now: INSIDE_WINDOW,
    });
    assert.equal(existingPhone.ok, false);
    assert.equal(existingPhone.reason, "phone_already_existed");

    const self = shouldCreditReferral({
      user: finishedUser({
        _id: a._id,
        phoneNumber: a.phoneNumber,
        referredBy: "Ab3Cd4Ef",
        refCode: "Ab3Cd4Ef",
      }),
      referrer: a,
      now: INSIDE_WINDOW,
    });
    assert.equal(self.ok, false);
    assert.equal(self.reason, "self_referral");
    assert.equal(
      isSelfReferral({
        user: { _id: a._id, phoneNumber: a.phoneNumber, refCode: "Ab3Cd4Ef" },
        referrer: a,
        referredBy: "Ab3Cd4Ef",
      }),
      true
    );
  });

  it("accepts referredBy or ref and both public link shapes", () => {
    assert.equal(readReferredBy({ referredBy: "Ab3Cd4Ef" }), "Ab3Cd4Ef");
    assert.equal(readReferredBy({ ref: "Ab3Cd4Ef" }), "Ab3Cd4Ef");
    assert.equal(readReferredBy({ ref: "../not-a-code" }), "");
    assert.equal(extractRefCode("https://powalert.com/go?ref=Ab3Cd4Ef"), "Ab3Cd4Ef");
    assert.equal(
      extractRefCode("https://powalert.com/go?from=win&ref=Ab3Cd4Ef"),
      "Ab3Cd4Ef"
    );
    assert.equal(extractRefCode("from=win&ref=Ab3Cd4Ef"), "Ab3Cd4Ef");
    assert.equal(readReferredBy({ ref: "https://powalert.com/go?ref=Ab3Cd4Ef" }), "Ab3Cd4Ef");
    assert.equal(
      readReferredBy({ referredBy: "https://powalert.com/go?from=win&ref=Ab3Cd4Ef" }),
      "Ab3Cd4Ef"
    );
    const stripped = stripContestServerFields({
      name: "Pat",
      entries: 99,
      refCode: "HACK",
      referredCompleteCount: 9,
      ipHash: "abc",
      fraudFlag: true,
      referralCredited: true,
      referralCreditEligible: true,
    });
    assert.equal(stripped.name, "Pat");
    assert.equal(stripped.entries, undefined);
    assert.equal(stripped.refCode, undefined);
    assert.equal(stripped.fraudFlag, undefined);
    const write = sanitizeUserWrite({
      name: "Pat",
      ref: "Ab3Cd4Ef",
      entries: 99,
      permissions: "admin",
      followClaims: [{ network: "x" }],
      baseEntryGranted: true,
    });
    assert.equal(write.referredBy, "Ab3Cd4Ef");
    assert.equal(write.safeFields.entries, undefined);
    assert.equal(write.safeFields.permissions, undefined);
    assert.equal(write.safeFields.ref, undefined);
    assert.equal(write.safeFields.followClaims, undefined);
    assert.equal(write.safeFields.baseEntryGranted, undefined);
  });
});

describe("honor-system follow extras (not verified)", () => {
  it("accepts x/tiktok/instagram/facebook and confirms only X in v1", () => {
    assert.deepEqual(FOLLOW_NETWORKS, ["x", "tiktok", "instagram", "facebook"]);
    assert.equal(FOLLOW_V1_CONFIRMED.x, "@pow_alert");
    assert.equal(FOLLOW_EXTRA_MAX, 4);
  });

  it("adds +1 once per network, max 4, and is idempotent", () => {
    const user = { entries: 1, followClaims: [] };
    const first = planFollowClaim({ user, network: "x", handle: "@ski" });
    assert.equal(first.ok, true);
    assert.equal(first.noop, false);
    assert.equal(first.entries, 2);
    assert.equal(first.followClaims[0].network, "x");
    assert.equal(first.followClaims[0].handle, "@ski");

    const again = planFollowClaim({
      user: { ...user, entries: first.entries, followClaims: first.followClaims },
      network: "x",
    });
    assert.equal(again.noop, true);
    assert.equal(again.entriesDelta, 0);

    let current = { entries: first.entries, followClaims: first.followClaims };
    for (const network of ["tiktok", "instagram", "facebook"]) {
      const next = planFollowClaim({ user: current, network });
      assert.equal(next.noop, false);
      current = { entries: next.entries, followClaims: next.followClaims };
    }
    assert.equal(current.entries, 5);
    assert.equal(current.followClaims.length, 4);

    const overflow = planFollowClaim({ user: current, network: "x" });
    assert.equal(overflow.noop, true);
    assert.equal(overflow.entriesDelta, 0);
  });

  it("rejects an unknown network and does not require a handle", () => {
    const missing = planFollowClaim({ user: { entries: 1, followClaims: [] }, network: "threads" });
    assert.equal(missing.ok, false);
    assert.equal(missing.reason, "invalid_network");

    const noHandle = planFollowClaim({ user: { entries: 0, followClaims: [] }, network: "tiktok" });
    assert.equal(noHandle.ok, true);
    assert.equal(noHandle.followClaims[0].handle, "");
  });

  it("does not steal the finished-/go base entry after a follow claim", () => {
    const afterFollow = finishedUser({
      name: "A",
      entries: 1,
      followClaims: [{ network: "x", handle: "@pow_alert" }],
      baseEntryGranted: false,
    });
    const plan = planContestAfterSave({
      user: afterFollow,
      wasAlreadyFinished: false,
      now: INSIDE_WINDOW,
    });
    assert.ok(plan.userSet.refCode);
    assert.equal(plan.userSet.entries, 2);
    assert.equal(plan.userSet.baseEntryGranted, true);
  });
});

describe("admin CSV + weighted draw", () => {
  it("masks phones and emits the documented CSV columns", () => {
    assert.equal(maskPhone("17205550100"), "*******0100");
    const rows = [
      toAdminRow({
        phoneNumber: "17205550101",
        createdAt: "2026-09-10T18:00:00.000Z",
        refCode: "Ab3Cd4Ef",
        entries: 6,
        referredCompleteCount: 1,
        referredBy: "",
        ipHash: "deadbeef",
        fraudFlag: false,
        followClaims: [{ network: "x" }, { network: "tiktok" }],
      }),
      toAdminRow({
        phoneNumber: "17205550102",
        createdAt: "2026-09-11T18:00:00.000Z",
        refCode: "Xy9Zt8Uv",
        entries: 1,
        referredCompleteCount: 0,
        referredBy: "Ab3Cd4Ef",
        ipHash: "cafebabe",
        fraudFlag: true,
      }),
    ];
    const csv = adminEntriesToCsv(rows);
    assert.equal(csv.split("\n")[0], ADMIN_CSV_COLUMNS.join(","));
    assert.match(csv, /\*{7}0101/);
    assert.match(csv, /Ab3Cd4Ef,6,1/);
    assert.match(csv, /Xy9Zt8Uv,1,0,Ab3Cd4Ef/);
    assert.match(csv, /followClaimCount,followNetworks/);
    assert.match(csv, /2,x\|tiktok/);
  });

  it("picks 1 row with probability proportional to entries", () => {
    const a = finishedUser({ name: "A", refCode: "AAAAAAA2", entries: 1 });
    const b = finishedUser({ name: "B", refCode: "BBBBBBB3", entries: 5 });
    const unfinished = {
      ...finishedUser({ name: "", entries: 99, refCode: "NOPE0002" }),
    };
    const flagged = finishedUser({
      name: "Fraud",
      refCode: "FRAUDDD2",
      entries: 99,
      fraudFlag: true,
    });
    const first = pickWeightedWinner([a, b, unfinished, flagged], () => 0);
    assert.equal(first.winner.refCode, "AAAAAAA2");
    assert.equal(first.eligibleCount, 2);
    assert.equal(first.totalEntries, 6);

    const second = pickWeightedWinner([a, b], () => 0.2);
    assert.equal(second.winner.refCode, "BBBBBBB3");
  });

  it("returns the locked winner on a second draw instead of re-rolling", () => {
    const a = finishedUser({
      name: "A",
      refCode: "AAAAAAA2",
      entries: 1,
      contestDrawLocked: true,
      contestDrawnAt: INSIDE_WINDOW,
      contestEntriesAtDraw: 1,
    });
    const b = finishedUser({ name: "B", refCode: "BBBBBBB3", entries: 5 });
    const again = resolveDraw({
      lockedWinner: a,
      rows: [a, b],
      random: () => 0.9,
    });
    assert.equal(again.alreadyLocked, true);
    assert.equal(again.winnerUserId, String(a._id));
    assert.equal(again.entriesAtDraw, 1);
    assert.equal(again.winner.refCode, "AAAAAAA2");
  });
});

describe("fraud flags (no auto-ban)", () => {
  it("flags same-IP clusters and disposable-looking email, without banning", () => {
    const cluster = detectFraud({
      sameIpCount: SAME_IP_CLUSTER_THRESHOLD,
      email: "pat@mailinator.com",
    });
    assert.equal(cluster.flag, true);
    assert.ok(cluster.reasons.includes("same_ip_cluster"));
    assert.ok(cluster.reasons.includes("disposable_email"));

    const clean = detectFraud({ sameIpCount: 1, email: "pat@example.com" });
    assert.equal(clean.flag, false);

    const hashed = hashIp("203.0.113.10", "test-secret");
    assert.equal(hashed.length, 64);
    assert.notEqual(hashed, "203.0.113.10");
  });

  it("flags the Nth same-ipHash signup (threshold 3 = third, not fourth)", () => {
    assert.equal(SAME_IP_CLUSTER_THRESHOLD, 3);
    assert.equal(
      sameIpInclusiveCount({ existingWithHash: 0, alreadyHasThisHash: false }),
      1
    );
    assert.equal(
      sameIpInclusiveCount({ existingWithHash: 2, alreadyHasThisHash: false }),
      3
    );
    assert.equal(detectFraud({ sameIpCount: 1 }).flag, false);
    assert.equal(detectFraud({ sameIpCount: 2 }).flag, false);
    assert.equal(detectFraud({ sameIpCount: 3 }).flag, true);

    const third = planContestAfterSave({
      user: finishedUser({ name: "Third" }),
      sameIpCount: 3,
      now: INSIDE_WINDOW,
    });
    assert.equal(third.userSet.fraudFlag, true);
    assert.ok(third.userSet.fraudReasons.includes("same_ip_cluster"));

    const second = planContestAfterSave({
      user: finishedUser({ name: "Second" }),
      sameIpCount: 2,
      now: INSIDE_WINDOW,
    });
    assert.equal(second.userSet.fraudFlag, undefined);
  });
});

describe("refCode mint is collision-retryable and URL-safe", () => {
  it("exports one REF_CODE constant that mint and sanitize share", () => {
    assert.equal(REF_CODE.length, 8);
    assert.equal(
      REF_CODE.alphabet,
      "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"
    );
    assert.equal(isUrlSafeRefCode("Ab3Cd4Ef"), true);
    assert.equal(isUrlSafeRefCode("Ab3Cd4E"), false);
    assert.equal(isUrlSafeRefCode("Ab3Cd4Ef0"), false);
    assert.equal(isUrlSafeRefCode("O0Ilxxxx"), false);
  });

  it("returns short alphabet codes and never includes + or /", () => {
    const codes = new Set(Array.from({ length: 40 }, () => mintRefCode()));
    assert.equal(codes.size, 40);
    for (const code of codes) {
      assert.equal(isUrlSafeRefCode(code), true);
      assert.equal(code.length, REF_CODE.length);
      assert.doesNotMatch(code, /[+/=01IOl]/);
    }
  });
});

describe("ENABLE_POWDER_ALERT_CRON stays gated off", () => {
  it("does not schedule the 14:30 blast unless the env is exactly true", () => {
    const cron = readFileSync(join(root, "cron/visualCrossingCron.js"), "utf8");
    assert.match(cron, /ENABLE_POWDER_ALERT_CRON === "true"/);
    assert.doesNotMatch(cron, /ENABLE_POWDER_ALERT_CRON\s*=\s*"true"/);
  });

  it("admin contest routes are registered before /:id and require verifyToken", () => {
    const routes = readFileSync(join(root, "api/user.routes.js"), "utf8");
    const entriesAt = routes.indexOf('"/contest/entries"');
    const csvAt = routes.indexOf('"/contest/entries.csv"');
    const drawAt = routes.indexOf('"/contest/draw"');
    const idAt = routes.indexOf('"/:id"');
    assert.ok(entriesAt > 0 && entriesAt < idAt);
    assert.ok(csvAt > 0 && csvAt < idAt);
    assert.ok(drawAt > 0 && drawAt < idAt);
    assert.match(routes, /verifyToken, listContestEntries/);
    assert.match(routes, /verifyToken, drawContestWinner/);
    assert.match(routes, /"\/:id\/follow-claim"/);
    assert.match(routes, /verifyToken, claimFollowExtra/);
  });
});
