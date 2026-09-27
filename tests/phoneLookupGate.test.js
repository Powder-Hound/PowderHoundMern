import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import {
  buildValidatePhoneResponse,
  createValidatePhoneNumber,
} from "../utils/phoneLookupGate.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const mockRes = () => {
  const res = {
    statusCode: 0,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    send(payload) {
      this.body = payload;
      return this;
    },
  };
  return res;
};

describe("validate-phone soft-gate (Lookup is advisory)", () => {
  it("does not block OTP when Lookup says valid === false", () => {
    const { status, body } = buildValidatePhoneResponse({
      input: "7205550100",
      lookup: { valid: false, phoneNumber: "+17205550100" },
    });

    assert.equal(status, 200);
    assert.equal(body.valid, true);
    assert.equal(body.phoneNumber, "+17205550100");
    assert.equal(body.lookupValid, false);
    assert.match(body.warning, /Lookup/);
    assert.doesNotMatch(body.warning, /mobile line/i);
  });

  it("passes through Lookup valid === true with single-plus E.164", () => {
    const { status, body } = buildValidatePhoneResponse({
      input: "+17205550100",
      lookup: { valid: true, phoneNumber: "+17205550100" },
    });

    assert.equal(status, 200);
    assert.equal(body.valid, true);
    assert.equal(body.lookupValid, true);
    assert.equal(body.phoneNumber, "+17205550100");
    assert.equal(body.warning, undefined);
    assert.doesNotMatch(body.phoneNumber, /\+\+/);
  });

  it("normalizes Lookup ++ E.164 before returning it", () => {
    const { body } = buildValidatePhoneResponse({
      input: "7205550100",
      lookup: { valid: false, phoneNumber: "++17205550100" },
    });

    assert.equal(body.valid, true);
    assert.equal(body.phoneNumber, "+17205550100");
  });

  it("still returns a usable US E.164 when Lookup throws or 404s", () => {
    const { status, body } = buildValidatePhoneResponse({
      input: "(720) 555-0100",
      lookupError: { message: "The requested resource was not found", status: 404, code: 20404 },
    });

    assert.equal(status, 200);
    assert.equal(body.valid, true);
    assert.equal(body.phoneNumber, "+17205550100");
    assert.equal(body.lookupValid, false);
    assert.match(body.lookupError, /not found/i);
    assert.equal(body.lookupErrorStatus, 404);
    assert.equal(body.lookupErrorCode, 20404);
    assert.match(body.warning, /unavailable/i);
  });

  it("rejects numbers that are not a plausible US E.164", () => {
    const missing = buildValidatePhoneResponse({ input: "" });
    assert.equal(missing.status, 400);
    assert.equal(missing.body.valid, false);
    assert.match(missing.body.message, /required/i);

    const junk = buildValidatePhoneResponse({ input: "555" });
    assert.equal(junk.status, 400);
    assert.equal(junk.body.valid, false);
    assert.match(junk.body.message, /US phone/i);
  });
});

describe("validatePhoneNumber handler (mocked Lookup, no SMS)", () => {
  it("calls Lookup with +1 E.164 and proceeds when valid is false", async () => {
    const seen = [];
    const handler = createValidatePhoneNumber(async (to) => {
      seen.push(to);
      return { valid: false, phoneNumber: to };
    });
    const res = mockRes();

    await handler({ body: { phoneNumber: "7205550100" } }, res);

    assert.deepEqual(seen, ["+17205550100"]);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.valid, true);
    assert.equal(res.body.lookupValid, false);
    assert.equal(res.body.phoneNumber, "+17205550100");
  });

  it("returns normalized E.164 + lookupError when Lookup rejects", async () => {
    const handler = createValidatePhoneNumber(async () => {
      const err = new Error("Not Found");
      err.status = 404;
      throw err;
    });
    const res = mockRes();

    await handler({ body: { phoneNumber: "17205550100" } }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.valid, true);
    assert.equal(res.body.phoneNumber, "+17205550100");
    assert.equal(res.body.lookupError, "Not Found");
    assert.equal(res.body.lookupErrorStatus, 404);
  });

  it("does not call Lookup for a non-US-shaped number", async () => {
    let called = false;
    const handler = createValidatePhoneNumber(async () => {
      called = true;
      return { valid: true };
    });
    const res = mockRes();

    await handler({ body: { phoneNumber: "123" } }, res);

    assert.equal(called, false);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.valid, false);
  });
});

describe("validate-phone wiring does not hard-fail on Lookup valid", () => {
  it("uses the soft-gate helper instead of returning valid:false from Lookup", () => {
    const middleware = readFileSync(
      join(root, "middleware/twilioMiddleware.js"),
      "utf8"
    );
    assert.match(middleware, /createValidatePhoneNumber/);
    assert.doesNotMatch(
      middleware,
      /if \(phoneNumber\?\.valid\)/
    );
    assert.doesNotMatch(middleware, /message: "Invalid phone number"/);
  });
});
