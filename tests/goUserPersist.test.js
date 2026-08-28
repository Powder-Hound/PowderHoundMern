import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import mongoose from "mongoose";
import { digitsPhone, e164Phone } from "../utils/phone.js";
import { User } from "../models/users.model.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("phone helpers used by /go Twilio + users table", () => {
  it("strips Lookup E.164 to last-season digit format", () => {
    assert.equal(digitsPhone("+17205550100"), "17205550100");
    assert.equal(digitsPhone("17205550100"), "17205550100");
    assert.equal(digitsPhone("(720) 555-0100"), "7205550100");
    assert.equal(digitsPhone(""), "");
  });

  it("builds a single-plus E.164 for Verify send/check", () => {
    assert.equal(e164Phone("+17205550100"), "+17205550100");
    assert.equal(e164Phone("17205550100"), "+17205550100");
    assert.equal(e164Phone("++17205550100"), "+17205550100");
    assert.equal(e164Phone(""), "");
  });
});

describe("existing users collection + /go persist fields", () => {
  it("writes to the existing users collection, not a new one", () => {
    assert.equal(User.collection.collectionName, "users");
  });

  it("accepts a /go signup+PUT payload on the User model", () => {
    const resortId = new mongoose.Types.ObjectId();
    const user = new User({
      phoneNumber: digitsPhone("+17205550100"),
      phoneVerifySID: "VE_TEST_SID",
      name: "Pat",
      zipCode: "80202",
      notificationsActive: { phone: true, email: false },
      resortPreference: {
        skiPass: {
          Epic: true,
          Ikon: false,
          MountainCollective: false,
          Indy: false,
          MC: true,
        },
        resorts: [resortId],
      },
      alertThreshold: {
        preferredResorts: 12,
        anyResort: 18,
        snowfallPeriod: 24,
        uom: "in",
      },
    });

    assert.equal(user.validateSync(), undefined);
    assert.equal(user.phoneNumber, "17205550100");
    assert.equal(user.zipCode, "80202");
    assert.equal(user.notificationsActive.phone, true);
    assert.equal(user.resortPreference.skiPass.Epic, true);
    assert.equal(user.resortPreference.skiPass.MountainCollective, false);
    assert.equal(user.resortPreference.skiPass.toObject().MC, undefined);
    assert.equal(String(user.resortPreference.resorts[0]), String(resortId));
    assert.equal(user.alertThreshold.preferredResorts, 12);
    assert.equal(user.alertThreshold.anyResort, 18);
    assert.equal(user.alertThreshold.snowfallPeriod, 24);
    assert.equal(user.alertThreshold.uom, "in");
  });

  it("defaults snowfallPeriod to 24 when omitted", () => {
    const user = new User({
      phoneNumber: "17205550100",
      phoneVerifySID: "VE_TEST_SID",
    });
    assert.equal(user.alertThreshold.snowfallPeriod, 24);
    assert.equal(user.alertThreshold.preferredResorts, 12);
    assert.equal(user.alertThreshold.anyResort, 18);
    assert.equal(user.notificationsActive.phone, true);
  });

  it("rejects a bad zip instead of dropping the row", () => {
    const user = new User({
      phoneNumber: "17205550100",
      phoneVerifySID: "VE_TEST_SID",
      zipCode: "8020",
    });
    const err = user.validateSync();
    assert.ok(err);
    assert.equal(err.errors.zipCode.name, "ValidatorError");
  });
});

describe("ENABLE_POWDER_ALERT_CRON stays gated off", () => {
  it("does not schedule the 14:30 blast unless the env is exactly true", () => {
    const cron = readFileSync(join(root, "cron/visualCrossingCron.js"), "utf8");
    assert.match(cron, /ENABLE_POWDER_ALERT_CRON === "true"/);
    assert.match(cron, /30 14 \* \* \*/);
    assert.doesNotMatch(cron, /ENABLE_POWDER_ALERT_CRON\s*=\s*"true"/);
  });

  it("Twilio Verify send no longer prepends + onto E.164", () => {
    const middleware = readFileSync(
      join(root, "middleware/twilioMiddleware.js"),
      "utf8"
    );
    assert.match(middleware, /e164Phone/);
    assert.doesNotMatch(middleware, /to: `\$\{req\.body\.phoneNumber\}`/);
    assert.doesNotMatch(middleware, /to: `\+\$\{req\.body\.phoneNumber\}`/);
  });
});
