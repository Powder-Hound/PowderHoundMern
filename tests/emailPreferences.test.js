import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { User } from "../models/users.model.js";
import {
  applyEmailPreferenceFields,
  isValidEmail,
  normalizeEmail,
  parseEmailInput,
} from "../utils/email.js";

describe("optional email normalize + validate", () => {
  it("trims and lowercases", () => {
    assert.equal(normalizeEmail("  Pat@PowAlert.COM "), "pat@powalert.com");
    assert.equal(normalizeEmail(null), "");
    assert.equal(normalizeEmail(""), "");
  });

  it("accepts a normal address and rejects junk", () => {
    assert.equal(isValidEmail("pat@powalert.com"), true);
    assert.equal(isValidEmail("  Pat@PowAlert.COM "), true);
    assert.equal(isValidEmail("not-an-email"), false);
    assert.equal(isValidEmail(""), false);
    assert.equal(isValidEmail("pat@"), false);
  });

  it("treats empty/null as a clear, not an invalid format", () => {
    assert.deepEqual(parseEmailInput(""), {
      provided: true,
      email: "",
      clear: true,
    });
    assert.deepEqual(parseEmailInput(null), {
      provided: true,
      email: "",
      clear: true,
    });
    assert.equal(parseEmailInput(undefined).provided, false);
    assert.equal(parseEmailInput("nope").invalid, true);
  });
});

describe("entering email is not marketing consent", () => {
  it("sets email without flipping consent", () => {
    const result = applyEmailPreferenceFields({
      body: { email: "  Pat@PowAlert.COM ", emailSource: "preferences" },
      existing: { email: "", emailMarketingConsent: false },
    });
    assert.equal(result.ok, true);
    assert.equal(result.fields.email, "pat@powalert.com");
    assert.equal(result.fields.emailSource, "preferences");
    assert.equal(result.fields.emailMarketingConsent, undefined);
    assert.equal(result.consent, false);
  });

  it("records consent timestamp only when consent is true", () => {
    const now = new Date("2026-09-16T12:00:00.000Z");
    const granted = applyEmailPreferenceFields({
      body: { email: "pat@powalert.com", emailMarketingConsent: true },
      existing: { email: "", emailMarketingConsent: false },
      now,
    });
    assert.equal(granted.fields.emailMarketingConsent, true);
    assert.equal(granted.fields.emailMarketingConsentAt, now);

    const withdrawn = applyEmailPreferenceFields({
      body: { emailMarketingConsent: false },
      existing: {
        email: "pat@powalert.com",
        emailMarketingConsent: true,
        emailMarketingConsentAt: now,
      },
      now,
    });
    assert.equal(withdrawn.fields.emailMarketingConsent, false);
    assert.equal(withdrawn.fields.emailMarketingConsentAt, null);
  });

  it("clears consent when the address is cleared", () => {
    const result = applyEmailPreferenceFields({
      body: { email: "" },
      existing: {
        email: "pat@powalert.com",
        emailMarketingConsent: true,
        emailMarketingConsentAt: new Date(),
      },
    });
    assert.equal(result.fields.email, "");
    assert.equal(result.fields.emailMarketingConsent, false);
    assert.equal(result.fields.emailMarketingConsentAt, null);
  });

  it("resets consent when the address changes unless this request re-consents", () => {
    const changed = applyEmailPreferenceFields({
      body: { email: "new@powalert.com" },
      existing: {
        email: "old@powalert.com",
        emailMarketingConsent: true,
      },
    });
    assert.equal(changed.fields.email, "new@powalert.com");
    assert.equal(changed.fields.emailMarketingConsent, false);
    assert.equal(changed.fields.emailMarketingConsentAt, null);

    const now = new Date("2026-09-16T12:00:00.000Z");
    const reconsent = applyEmailPreferenceFields({
      body: { email: "new@powalert.com", emailMarketingConsent: true },
      existing: {
        email: "old@powalert.com",
        emailMarketingConsent: true,
      },
      now,
    });
    assert.equal(reconsent.fields.emailMarketingConsent, true);
    assert.equal(reconsent.fields.emailMarketingConsentAt, now);
  });

  it("rejects a bad format without writing consent", () => {
    const result = applyEmailPreferenceFields({
      body: { email: "not-an-email", emailMarketingConsent: true },
      existing: {},
    });
    assert.equal(result.ok, false);
    assert.equal(result.status, 400);
  });
});

describe("User schema keeps email optional for last-season rows", () => {
  it("saves a /go user with no email and consent false", () => {
    const user = new User({
      phoneNumber: "17205550100",
      phoneVerifySID: "VE_TEST_SID",
    });
    assert.equal(user.validateSync(), undefined);
    assert.equal(user.email, "");
    assert.equal(user.emailMarketingConsent, false);
    assert.equal(user.emailMarketingConsentAt, null);
    assert.equal(user.emailSource, "");
  });

  it("normalizes and rejects invalid email on the model", () => {
    const user = new User({
      phoneNumber: "17205550100",
      phoneVerifySID: "VE_TEST_SID",
      email: "  Pat@PowAlert.COM ",
    });
    assert.equal(user.email, "pat@powalert.com");
    assert.equal(user.validateSync(), undefined);

    const bad = new User({
      phoneNumber: "17205550101",
      phoneVerifySID: "VE_TEST_SID",
      email: "not-an-email",
    });
    const err = bad.validateSync();
    assert.ok(err);
    assert.equal(err.errors.email.name, "ValidatorError");
  });
});
