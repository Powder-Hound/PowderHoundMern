import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import mongoose from "mongoose";
import {
  CRM_CSV_COLUMNS,
  buildCrmFilter,
  crmRowsToCsv,
  isOnAdminAllowlist,
  parseAdminPhoneAllowlist,
  parseCrmPaging,
  toCrmRow,
} from "../utils/adminCrm.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("admin allow-list is fail-closed", () => {
  it("parses comma/space phones to digits and ignores blanks", () => {
    const set = parseAdminPhoneAllowlist(" +1 (720) 555-0100, 17205550111 ");
    assert.equal(set.has("17205550100"), true);
    assert.equal(set.has("17205550111"), true);
    assert.equal(set.size, 2);
    assert.equal(parseAdminPhoneAllowlist("").size, 0);
    assert.equal(parseAdminPhoneAllowlist(undefined).size, 0);
  });

  it("does not treat JWT admin as sufficient without the phone list", () => {
    const empty = parseAdminPhoneAllowlist("");
    assert.equal(isOnAdminAllowlist("17205550100", empty), false);
    assert.equal(
      isOnAdminAllowlist("17205550100", parseAdminPhoneAllowlist("17205550100")),
      true
    );
    assert.equal(
      isOnAdminAllowlist("17205550999", parseAdminPhoneAllowlist("17205550100")),
      false
    );
  });
});

describe("CRM row + filters (contest/IG if present)", () => {
  it("maps name/phone/email/consent/passes/hills/stick/verified/contest/IG", () => {
    const resortId = new mongoose.Types.ObjectId();
    const row = toCrmRow({
      _id: new mongoose.Types.ObjectId(),
      name: "Pat",
      phoneNumber: "17205550100",
      email: "Pat@PowAlert.COM",
      emailMarketingConsent: true,
      emailMarketingConsentAt: "2026-09-16T12:00:00.000Z",
      emailSource: "preferences",
      phoneVerifySID: "VE_TEST_SID",
      createdAt: "2026-09-16T00:00:00.000Z",
      resortPreference: {
        skiPass: { Epic: true, Ikon: false, Indy: false, MountainCollective: false },
        resorts: [resortId],
      },
      alertThreshold: {
        preferredResorts: 12,
        anyResort: 18,
        snowfallPeriod: 24,
        uom: "in",
      },
      refCode: "Ab3Cd4Ef",
      entries: 6,
      followClaims: [{ network: "instagram", handle: "@patski" }],
    });

    assert.equal(row.name, "Pat");
    assert.equal(row.phone, "17205550100");
    assert.equal(row.email, "pat@powalert.com");
    assert.equal(row.emailMarketingConsent, true);
    assert.deepEqual(row.passes, ["Epic"]);
    assert.deepEqual(row.followedResorts, [String(resortId)]);
    assert.equal(row.stick.preferredResorts, 12);
    assert.equal(row.verifiedProxy, true);
    assert.equal(row.contestStatus, "entered");
    assert.equal(row.instagramHandle, "@patski");
  });

  it("leaves contest/IG blank when those fields are absent on main", () => {
    const row = toCrmRow({
      name: "Lee",
      phoneNumber: "17205550111",
      phoneVerifySID: "VE",
    });
    assert.equal(row.contestStatus, "");
    assert.equal(row.instagramHandle, "");
    assert.equal(row.emailMarketingConsent, false);
    assert.equal(row.verifiedProxy, true);
  });

  it("filters followsResort/pass/contest/IG/email-consented/hasEmail", async () => {
    const resortId = new mongoose.Types.ObjectId();
    const parsed = await buildCrmFilter({
      q: "Pat",
      resort: String(resortId),
      pass: "Epic",
      contest: "true",
      ig: "true",
      emailConsented: "true",
      hasEmail: "true",
    });
    assert.equal(parsed.ok, true);
    const and = parsed.filter.$and;
    assert.ok(Array.isArray(and));
    assert.ok(and.some((clause) => clause.name || clause.$or));
    assert.ok(
      and.some((clause) => clause["resortPreference.skiPass.Epic"] === true)
    );
    assert.ok(and.some((clause) => clause.emailMarketingConsent === true));
    assert.ok(and.some((clause) => clause.email?.$gt === ""));
    assert.ok(
      and.some(
        (clause) =>
          clause["resortPreference.resorts"] &&
          String(clause["resortPreference.resorts"]) === String(resortId)
      )
    );
    assert.ok(
      and.some(
        (clause) =>
          Array.isArray(clause.$or) &&
          clause.$or.some((item) => item["followClaims.network"] === "instagram")
      )
    );
    assert.ok(parsed.applied.some((item) => item.id === "hasEmail"));
    assert.ok(parsed.applied.some((item) => item.id === "followsResort"));
  });

  it("rejects an unknown pass instead of building a raw path", async () => {
    const parsed = await buildCrmFilter({ pass: "IkonPlus" });
    assert.equal(parsed.ok, false);
    assert.equal(parsed.status, 400);
  });

  it("CSV and list share the same segment filter builder", () => {
    const controller = readFileSync(
      join(root, "controllers/admin.controller.js"),
      "utf8"
    );
    assert.match(controller, /const parsed = await buildCrmFilter\(req\.query\)/);
    assert.equal(
      controller.split("await buildCrmFilter(req.query)").length - 1,
      2
    );
  });
});

describe("admin CSV export", () => {
  it("emits the CRM columns including email consent", () => {
    const csv = crmRowsToCsv([
      toCrmRow({
        _id: "abc123",
        name: "Pat, Ski",
        phoneNumber: "17205550100",
        email: "pat@powalert.com",
        emailMarketingConsent: true,
        resortPreference: { skiPass: { Ikon: true }, resorts: ["r1"] },
        alertThreshold: { preferredResorts: 10, anyResort: 16, uom: "in" },
        phoneVerifySID: "VE",
      }),
    ]);
    assert.equal(csv.split("\n")[0], CRM_CSV_COLUMNS.join(","));
    assert.match(csv, /"Pat, Ski"/);
    assert.match(csv, /pat@powalert.com/);
    assert.match(csv, /true/);
    assert.match(csv, /Ikon/);
    assert.doesNotMatch(csv, /password/);
  });

  it("caps list pages and allows a larger export", () => {
    assert.deepEqual(parseCrmPaging({ page: "2", limit: "999" }), {
      page: 2,
      limit: 200,
      skip: 200,
    });
    assert.equal(parseCrmPaging({}, { exportAll: true }).limit, 10000);
  });
});

describe("admin CRM routes stay private and do not touch storm SMS", () => {
  it("registers allow-listed admin routes and /admin HTML", () => {
    const html = readFileSync(join(root, "public/admin.html"), "utf8");
    const routes = readFileSync(join(root, "api/admin.routes.js"), "utf8");
    const index = readFileSync(join(root, "index.js"), "utf8");
    const users = readFileSync(join(root, "api/user.routes.js"), "utf8");
    const middleware = readFileSync(
      join(root, "middleware/adminMiddleware.js"),
      "utf8"
    );

    assert.match(routes, /verifyToken, requireAdminCrm, listCrmUsers/);
    assert.match(routes, /verifyToken, requireAdminCrm, exportCrmUsersCsv/);
    assert.match(index, /app\.use\("\/api\/admin", adminRouter\)/);
    assert.match(index, /app\.get\("\/admin", serveAdminHtml\)/);
    assert.match(users, /patch\("\/:id\/preferences"/);
    assert.match(middleware, /ADMIN_PHONE_ALLOWLIST/);
    assert.match(middleware, /permissions !== "admin"/);
    assert.match(middleware, /allowlist\.size === 0/);
    assert.match(routes, /followsResort/);
    assert.match(routes, /hasEmail/);
    assert.match(html, /followsResort/);
    assert.match(html, /hasEmail/);
    assert.match(html, /emailMarketingConsent/);
    assert.doesNotMatch(routes, /sendEmail|sendTextMessage|campaign/);
  });

  it("does not change the storm/stick cron lock", () => {
    const cron = readFileSync(join(root, "cron/visualCrossingCron.js"), "utf8");
    const service = readFileSync(
      join(root, "services/weatherAlertService.js"),
      "utf8"
    );
    assert.match(cron, /ENABLE_POWDER_ALERT_CRON === "true"/);
    assert.doesNotMatch(cron, /ENABLE_POWDER_ALERT_CRON\s*=\s*"true"/);
    assert.match(service, /isPowderAlertCronEnabled/);
    assert.match(service, /STORM_ALERT_LEAD_DAYS/);
  });
});
