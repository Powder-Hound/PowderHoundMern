import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { clientIp } from "../utils/clientIp.js";
import {
  OTP_RATE_LIMITS,
  checkOtpRateLimit,
  createMemoryStore,
  limitsForAction,
} from "../utils/otpRateLimit.js";
import {
  TURNSTILE_SITEVERIFY_URL,
  TURNSTILE_TOKEN_FIELD,
  botProtectionPublicConfig,
  extractTurnstileToken,
  resolveTurnstilePolicy,
  verifyTurnstileToken,
} from "../utils/turnstile.js";
import { createOtpProtection } from "../middleware/otpBotProtection.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const mockRes = () => {
  const res = {
    statusCode: 0,
    body: null,
    headers: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    set(name, value) {
      this.headers[name] = value;
      return this;
    },
    send(payload) {
      this.body = payload;
      return this;
    },
  };
  return res;
};

describe("OTP rate-limit status (before this PR there was none)", () => {
  it("documents send/verify/validate windows", () => {
    assert.equal(OTP_RATE_LIMITS.send.phone.max, 3);
    assert.equal(OTP_RATE_LIMITS.send.ip.max, 8);
    assert.equal(OTP_RATE_LIMITS.verify.phone.max, 8);
    assert.equal(OTP_RATE_LIMITS.verify.ip.max, 25);
    assert.equal(OTP_RATE_LIMITS.validate.phone.max, 10);
    assert.equal(OTP_RATE_LIMITS.send.phone.windowMs, 10 * 60 * 1000);
  });

  it("honors env overrides only when they are positive integers", () => {
    const limits = limitsForAction("send", {
      OTP_SEND_PHONE_MAX: "1",
      OTP_SEND_IP_MAX: "0",
      OTP_SEND_PHONE_WINDOW_MS: "nope",
    });
    assert.equal(limits.phone.max, 1);
    assert.equal(limits.ip.max, OTP_RATE_LIMITS.send.ip.max);
    assert.equal(limits.phone.windowMs, OTP_RATE_LIMITS.send.phone.windowMs);
  });
});

describe("client IP", () => {
  it("strips IPv4-mapped IPv6 and fail-closes to unknown", () => {
    assert.equal(clientIp({ ip: "::ffff:203.0.113.9" }), "203.0.113.9");
    assert.equal(clientIp({ ip: "203.0.113.9" }), "203.0.113.9");
    assert.equal(clientIp({}), "unknown");
  });
});

describe("per IP + per phone sliding window", () => {
  it("allows send up to the phone max then 429s that number", () => {
    const store = createMemoryStore();
    const env = {};
    const now = 1_000_000;
    for (let i = 0; i < OTP_RATE_LIMITS.send.phone.max; i += 1) {
      const ok = checkOtpRateLimit({
        action: "send",
        ip: "203.0.113.1",
        phone: "+17205550100",
        store,
        env,
        now,
      });
      assert.equal(ok.ok, true);
    }
    const blocked = checkOtpRateLimit({
      action: "send",
      ip: "203.0.113.1",
      phone: "+17205550100",
      store,
      env,
      now: now + 1000,
    });
    assert.equal(blocked.ok, false);
    assert.equal(blocked.bucket, "phone");
    assert.ok(blocked.retryAfterSec >= 1);

    const otherPhone = checkOtpRateLimit({
      action: "send",
      ip: "203.0.113.1",
      phone: "+17205550101",
      store,
      env,
      now: now + 1000,
    });
    assert.equal(otherPhone.ok, true);
  });

  it("429s send when the same IP hits too many numbers", () => {
    const store = createMemoryStore();
    const now = 2_000_000;
    let last = { ok: true };
    for (let i = 0; i < OTP_RATE_LIMITS.send.ip.max + 1; i += 1) {
      last = checkOtpRateLimit({
        action: "send",
        ip: "198.51.100.2",
        phone: `+17205550${String(100 + i).padStart(3, "0")}`,
        store,
        env: {},
        now,
      });
    }
    assert.equal(last.ok, false);
    assert.equal(last.bucket, "ip");
  });

  it("tracks verify separately from send and expires after the window", () => {
    const store = createMemoryStore();
    const now = 3_000_000;
    const send = checkOtpRateLimit({
      action: "send",
      ip: "192.0.2.9",
      phone: "+17205550999",
      store,
      env: {},
      now,
    });
    assert.equal(send.ok, true);

    for (let i = 0; i < OTP_RATE_LIMITS.verify.phone.max; i += 1) {
      assert.equal(
        checkOtpRateLimit({
          action: "verify",
          ip: "192.0.2.9",
          phone: "+17205550999",
          store,
          env: {},
          now,
        }).ok,
        true
      );
    }
    const blocked = checkOtpRateLimit({
      action: "verify",
      ip: "192.0.2.9",
      phone: "+17205550999",
      store,
      env: {},
      now,
    });
    assert.equal(blocked.ok, false);
    assert.equal(blocked.bucket, "phone");

    const afterWindow = checkOtpRateLimit({
      action: "verify",
      ip: "192.0.2.9",
      phone: "+17205550999",
      store,
      env: {},
      now: now + OTP_RATE_LIMITS.verify.phone.windowMs + 1,
    });
    assert.equal(afterWindow.ok, true);
  });
});

describe("Turnstile policy (fail closed; skip is explicit and non-prod only)", () => {
  it("requires a token when the secret is set, including production", () => {
    const prod = resolveTurnstilePolicy({
      NODE_ENV: "production",
      TURNSTILE_SECRET_KEY: "0xsecret",
      TURNSTILE_SITE_KEY: "0xpublic",
    });
    assert.equal(prod.required, true);
    assert.equal(prod.skip, false);
    assert.equal(prod.secret, "0xsecret");
    assert.equal(prod.siteKey, "0xpublic");
  });

  it("fail-closes when production has no secret, even if TURNSTILE_SKIP=true", () => {
    const policy = resolveTurnstilePolicy({
      NODE_ENV: "production",
      TURNSTILE_SKIP: "true",
    });
    assert.equal(policy.required, true);
    assert.equal(policy.failClosedMissingSecret, true);
    assert.equal(policy.skip, false);
  });

  it("ignores TURNSTILE_SKIP in production when a secret is set", () => {
    const policy = resolveTurnstilePolicy({
      NODE_ENV: "production",
      TURNSTILE_SECRET_KEY: "0xsecret",
      TURNSTILE_SKIP: "true",
    });
    assert.equal(policy.required, true);
    assert.equal(policy.skip, false);
  });

  it("skips only when TURNSTILE_SKIP=true outside production", () => {
    const skipped = resolveTurnstilePolicy({
      NODE_ENV: "test",
      TURNSTILE_SKIP: "true",
    });
    assert.equal(skipped.required, false);
    assert.equal(skipped.skip, true);
    assert.equal(skipped.reason, "explicit_skip");

    const localClosed = resolveTurnstilePolicy({
      NODE_ENV: "development",
    });
    assert.equal(localClosed.required, true);
    assert.equal(localClosed.failClosedMissingSecret, true);
  });

  it("exposes the public site key and token field without the secret", () => {
    const config = botProtectionPublicConfig({
      NODE_ENV: "production",
      TURNSTILE_SECRET_KEY: "0xsecret",
      TURNSTILE_SITE_KEY: "0xpublic",
    });
    assert.equal(config.turnstileRequired, true);
    assert.equal(config.siteKey, "0xpublic");
    assert.equal(config.tokenField, TURNSTILE_TOKEN_FIELD);
    assert.equal(JSON.stringify(config).includes("0xsecret"), false);
  });
});

describe("Turnstile siteverify", () => {
  it("reads turnstileToken (and Cloudflare's form field name)", () => {
    assert.equal(
      extractTurnstileToken({ body: { turnstileToken: " tok " } }),
      "tok"
    );
    assert.equal(
      extractTurnstileToken({
        body: { "cf-turnstile-response": "cf-tok" },
      }),
      "cf-tok"
    );
    assert.equal(extractTurnstileToken({ body: {} }), "");
  });

  it("fail-closes on missing token, missing secret, and siteverify success:false", async () => {
    const missingSecret = await verifyTurnstileToken({
      token: "tok",
      secret: "",
    });
    assert.equal(missingSecret.ok, false);
    assert.equal(missingSecret.body.code, "turnstile_unavailable");

    const missingToken = await verifyTurnstileToken({
      token: "",
      secret: "0xsecret",
    });
    assert.equal(missingToken.ok, false);
    assert.equal(missingToken.body.code, "turnstile_required");

    const failed = await verifyTurnstileToken({
      token: "bad",
      secret: "0xsecret",
      ip: "203.0.113.4",
      fetchImpl: async (url, init) => {
        assert.equal(url, TURNSTILE_SITEVERIFY_URL);
        const body = JSON.parse(init.body);
        assert.equal(body.secret, "0xsecret");
        assert.equal(body.response, "bad");
        assert.equal(body.remoteip, "203.0.113.4");
        return {
          json: async () => ({ success: false, "error-codes": ["invalid-input-response"] }),
        };
      },
    });
    assert.equal(failed.ok, false);
    assert.equal(failed.body.code, "turnstile_failed");
    assert.equal(failed.body.errorCodes, undefined);
  });

  it("passes when siteverify returns success:true", async () => {
    const ok = await verifyTurnstileToken({
      token: "good",
      secret: "0xsecret",
      fetchImpl: async () => ({
        json: async () => ({ success: true }),
      }),
    });
    assert.equal(ok.ok, true);
  });

  it("fail-closes when siteverify throws or times out", async () => {
    const down = await verifyTurnstileToken({
      token: "tok",
      secret: "0xsecret",
      fetchImpl: async () => {
        throw new Error("network");
      },
    });
    assert.equal(down.ok, false);
    assert.equal(down.body.code, "turnstile_unavailable");
  });
});

describe("OTP bot-protection middleware", () => {
  const skipEnv = { NODE_ENV: "test", TURNSTILE_SKIP: "true" };

  it("blocks send without a Turnstile token when a secret is configured", async () => {
    const store = createMemoryStore();
    const mw = createOtpProtection({
      action: "send",
      requireTurnstile: true,
      store,
      env: {
        NODE_ENV: "production",
        TURNSTILE_SECRET_KEY: "0xsecret",
      },
      fetchImpl: async () => {
        throw new Error("should not call siteverify without a token");
      },
    });
    const res = mockRes();
    let nextCalled = false;
    await mw(
      { ip: "203.0.113.8", body: { phoneNumber: "+17205550100" } },
      res,
      () => {
        nextCalled = true;
      }
    );
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.code, "turnstile_required");
  });

  it("lets send through after a passing token, then 429s the 4th SMS to one phone", async () => {
    const store = createMemoryStore();
    const mw = createOtpProtection({
      action: "send",
      requireTurnstile: true,
      store,
      env: {
        NODE_ENV: "production",
        TURNSTILE_SECRET_KEY: "0xsecret",
      },
      fetchImpl: async () => ({ json: async () => ({ success: true }) }),
    });

    for (let i = 0; i < OTP_RATE_LIMITS.send.phone.max; i += 1) {
      const res = mockRes();
      let nextCalled = false;
      await mw(
        {
          ip: "203.0.113.10",
          body: { phoneNumber: "7205550100", turnstileToken: `tok-${i}` },
        },
        res,
        () => {
          nextCalled = true;
        }
      );
      assert.equal(nextCalled, true, `attempt ${i + 1} should pass`);
      assert.equal(res.statusCode, 0);
    }

    const blocked = mockRes();
    let nextCalled = false;
    await mw(
      {
        ip: "203.0.113.10",
        body: { phoneNumber: "7205550100", turnstileToken: "tok-last" },
      },
      blocked,
      () => {
        nextCalled = true;
      }
    );
    assert.equal(nextCalled, false);
    assert.equal(blocked.statusCode, 429);
    assert.equal(blocked.body.code, "rate_limited");
    assert.equal(blocked.headers["Retry-After"], String(blocked.body.retryAfter));
  });

  it("rate-limits verify without requiring Turnstile", async () => {
    const store = createMemoryStore();
    const mw = createOtpProtection({
      action: "verify",
      requireTurnstile: false,
      store,
      env: skipEnv,
    });
    for (let i = 0; i < OTP_RATE_LIMITS.verify.phone.max; i += 1) {
      const res = mockRes();
      await mw(
        { ip: "203.0.113.11", body: { phoneNumber: "+17205550100", code: "123456" } },
        res,
        () => {}
      );
      assert.equal(res.statusCode, 0);
    }
    const blocked = mockRes();
    await mw(
      { ip: "203.0.113.11", body: { phoneNumber: "+17205550100", code: "000000" } },
      blocked,
      () => {}
    );
    assert.equal(blocked.statusCode, 429);
  });

  it("skips Turnstile when TURNSTILE_SKIP=true in test, still rate-limits", async () => {
    const store = createMemoryStore();
    const mw = createOtpProtection({
      action: "send",
      requireTurnstile: true,
      store,
      env: skipEnv,
      fetchImpl: async () => {
        throw new Error("siteverify should not run when skip is set");
      },
    });
    const res = mockRes();
    let nextCalled = false;
    await mw(
      { ip: "203.0.113.12", body: { phoneNumber: "+17205550100" } },
      res,
      () => {
        nextCalled = true;
      }
    );
    assert.equal(nextCalled, true);
  });
});

describe("auth route wiring + storm cron untouched", () => {
  it("guards send (Turnstile + limits), verify (limits), validate-phone (limits)", () => {
    const routes = readFileSync(join(root, "api/auth.routes.js"), "utf8");
    assert.match(
      routes,
      /authRouter\.post\("\/send-verification-code", otpSendProtection, sendVerificationCode\)/
    );
    assert.match(
      routes,
      /authRouter\.post\("\/verify-otp", otpVerifyProtection, verifyOTP\)/
    );
    assert.match(
      routes,
      /authRouter\.post\("\/validate-phone", otpValidateProtection, validatePhoneNumber\)/
    );
    assert.match(routes, /authRouter\.get\("\/bot-protection", getBotProtectionConfig\)/);
    assert.match(routes, /turnstileToken/);
  });

  it("trusts Render's proxy so rate limits key on visitor IP", () => {
    const index = readFileSync(join(root, "index.js"), "utf8");
    assert.match(index, /trust proxy["'], 1/);
  });

  it("does not enable storm SMS cron or weaken the 16-day gate", () => {
    const cron = readFileSync(join(root, "cron/visualCrossingCron.js"), "utf8");
    const gate = readFileSync(join(root, "utils/stormAlertGate.js"), "utf8");
    assert.match(cron, /ENABLE_POWDER_ALERT_CRON === "true"/);
    assert.doesNotMatch(cron, /ENABLE_POWDER_ALERT_CRON\s*=\s*"true"/);
    assert.match(gate, /STORM_ALERT_LEAD_DAYS = 16/);
  });
});
