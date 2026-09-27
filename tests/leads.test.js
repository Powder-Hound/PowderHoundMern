import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { Lead } from "../models/lead.model.js";
import { createLead } from "../controllers/lead.controller.js";
import { isAllowedCorsOrigin } from "../utils/corsOrigins.js";
import {
  buildGuideEmail,
  loadGuideMarkdown,
  pickGuideFilename,
  renderGuideMarkdown,
} from "../utils/guideContent.js";
import { hashClientIp } from "../utils/ipHash.js";
import { parseLeadBody } from "../utils/leadInput.js";
import {
  checkLeadRateLimit,
  DEFAULT_LEAD_DEDUPE_WINDOW_MS,
  LEAD_RATE_LIMITS,
  leadDedupeWindowMs,
  leadLimits,
} from "../utils/leadRateLimit.js";
import { leadTurnstileMode } from "../utils/leadTurnstile.js";
import { createMemoryStore } from "../utils/slidingWindowRateLimit.js";
import { TURNSTILE_SITEVERIFY_URL } from "../utils/turnstile.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const prodEnv = {
  NODE_ENV: "production",
  TURNSTILE_SECRET_KEY: "0xsecret",
  LEAD_IP_HASH_SALT: "test-salt",
};

const passFetch = async () => ({ json: async () => ({ success: true }) });

function mockRes() {
  return {
    statusCode: 0,
    body: null,
    headers: {},
    headersSent: false,
    status(code) {
      this.statusCode = code;
      return this;
    },
    set(name, value) {
      this.headers[name] = value;
      return this;
    },
    json(payload) {
      this.body = payload;
      this.headersSent = true;
      return this;
    },
  };
}

function fakeLeads() {
  const rows = [];
  return {
    rows,
    async findRecent({ email, guide, since }) {
      const cutoff = new Date(since).getTime();
      const hits = rows.filter(
        (row) =>
          row.email === email &&
          row.guide === guide &&
          new Date(row.createdAt).getTime() >= cutoff
      );
      hits.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      return hits[0] || null;
    },
    async create(doc) {
      const row = { ...doc, _id: `lead-${rows.length + 1}` };
      rows.push(row);
      return row;
    },
    async markEmail(id, patch) {
      const row = rows.find((item) => item._id === id);
      if (row) Object.assign(row, patch);
    },
  };
}

function validBody(overrides = {}) {
  return {
    email: "Pat@PowAlert.com",
    name: "Pat",
    phone: "(720) 555-0100",
    guide: "ski-vanlife",
    utm_source: "newsletter",
    utm_medium: "email",
    utm_campaign: "guides",
    utm_term: "van",
    utm_content: "hero",
    ref: "friend",
    consent: true,
    turnstileToken: "tok",
    ...overrides,
  };
}

async function post(body, extra = {}) {
  const res = mockRes();
  const sends = [];
  const leads = extra.leads || fakeLeads();
  const sendEmail =
    extra.sendEmail ||
    (async (...args) => {
      sends.push(args);
      return { ok: true };
    });
  await createLead(
    {
      ip: extra.ip || "203.0.113.10",
      headers: extra.headers || { "user-agent": "TestAgent/1.0" },
      body,
    },
    res,
    {
      env: extra.env || prodEnv,
      now: extra.now ?? 1_700_000_000_000,
      store: extra.store || createMemoryStore(),
      leads,
      sendEmail,
      fetchImpl: extra.fetchImpl || passFetch,
      loadGuideMarkdown: extra.loadGuideMarkdown,
      warn: extra.warn || (() => {}),
    }
  );
  return { res, leads, sends };
}

describe("lead body validation", () => {
  it("lowercases email, normalizes US phone, and keeps consent", () => {
    const parsed = parseLeadBody(validBody());
    assert.equal(parsed.ok, true);
    assert.equal(parsed.value.email, "pat@powalert.com");
    assert.equal(parsed.value.phone, "+17205550100");
    assert.equal(parsed.value.guide, "ski-vanlife");
    assert.equal(parsed.value.consent, true);
    assert.equal(parsed.value.ref, "friend");
    assert.equal(parsed.value.utm_source, "newsletter");
    const named = parseLeadBody(validBody({ name: "Pat\nBcc: evil" }));
    assert.equal(named.value.name, "Pat Bcc: evil");
  });

  it("rejects missing email, bad email, missing guide, unknown guide, and non-boolean consent", () => {
    assert.equal(parseLeadBody({ guide: "ski-vanlife", consent: true }).error, "email is required");
    assert.equal(
      parseLeadBody({ email: "not-an-email", guide: "ski-vanlife", consent: true }).error,
      "email is not a valid format"
    );
    assert.equal(parseLeadBody({ email: "pat@powalert.com", consent: true }).error, "guide is required");
    assert.equal(
      parseLeadBody({ email: "pat@powalert.com", guide: "backcountry", consent: true }).error,
      "guide is not available"
    );
    assert.equal(
      parseLeadBody({ email: "pat@powalert.com", guide: "ski-vanlife" }).error,
      "consent is required"
    );
    assert.equal(
      parseLeadBody({ email: "pat@powalert.com", guide: "ski-vanlife", consent: "true" }).error,
      "consent must be a boolean"
    );
  });

  it("treats an empty phone as omitted and keeps a non-US digit string as single-plus E.164", () => {
    const empty = parseLeadBody(validBody({ phone: "" }));
    assert.equal(empty.value.phone, "");
    const uk = parseLeadBody(validBody({ phone: "+44 7700 900123" }));
    assert.equal(uk.value.phone, "+447700900123");
  });
});

describe("guide markdown drop-in", () => {
  it("prefers the editorial filename, then the slug placeholder", () => {
    assert.equal(
      pickGuideFilename("ski-vanlife", ["ski-vanlife.md", "ski-vanlife-guide.md"]),
      "ski-vanlife-guide.md"
    );
    assert.equal(
      pickGuideFilename("adult-ski-camps", ["adult-ski-camps.md"]),
      "adult-ski-camps.md"
    );
    assert.equal(pickGuideFilename("ski-vanlife", []), null);
  });

  it("ships the editorial reports and escapes HTML", () => {
    const ski = loadGuideMarkdown("ski-vanlife");
    const camps = loadGuideMarkdown("adult-ski-camps");
    assert.match(ski, /The PowAlert Ski Vanlife & Camping Guide 2026\/27/);
    assert.match(camps, /Adult Ski Camps 2026\/27/);
    assert.doesNotMatch(ski, /PLACEHOLDER/);
    assert.doesNotMatch(camps, /PLACEHOLDER/);
    const html = renderGuideMarkdown("Hello <script>alert(1)</script>\n\n**Bold** and [Pow](https://powalert.com)");
    assert.match(html, /&lt;script&gt;/);
    assert.doesNotMatch(html, /<script>/);
    assert.match(html, /<strong>Bold<\/strong>/);
    assert.match(html, /href="https:\/\/powalert\.com"/);
  });

  it("renders tables with inline styles and keeps every unverified marker", () => {
    const sample = renderGuideMarkdown(
      "| Resort | Status |\n|---|---|\n| Sun Valley | (unverified) |"
    );
    assert.match(sample, /<table [^>]*style="[^"]*border-collapse:collapse/);
    assert.match(sample, /<th[^>]*>Resort<\/th>/);
    assert.match(sample, /<td[^>]*>\(unverified\)<\/td>/);
    assert.doesNotMatch(sample, /<style/);

    for (const slug of ["ski-vanlife", "adult-ski-camps"]) {
      const markdown = loadGuideMarkdown(slug);
      const html = renderGuideMarkdown(markdown);
      const sourceCount = (markdown.match(/unverified/gi) || []).length;
      const htmlCount = (html.match(/unverified/gi) || []).length;
      const tables = markdown.match(/^\|[-:| ]+\|\s*$/gm).length;
      assert.equal(htmlCount, sourceCount, `${slug} unverified count changed in render`);
      assert.equal(sourceCount, 0, `${slug} editorial file should have zero unverified markers`);
      assert.match(markdown, /https:\/\/powalert\.com\/go/);
      assert.equal((html.match(/<table\b/g) || []).length, tables, slug);
      assert.match(html, /border-collapse:collapse/);
    }

    const email = buildGuideEmail({
      guide: "ski-vanlife",
      markdown: loadGuideMarkdown("ski-vanlife"),
    });
    assert.match(email.html, /See PowAlert/);
    assert.match(email.ctaUrl, /^https:\/\/powalert\.com\/go\?from=ski-vanlife$/);
    assert.match(email.html, /href="https:\/\/powalert\.com\/go"/);
    assert.match(email.html, /Sun Valley/);
  });

  it("ends every guide email with the /go CTA and optional UTM", () => {
    const message = buildGuideEmail({
      guide: "adult-ski-camps",
      markdown: "Camp notes",
      name: "Pat",
      utm: { utm_source: "ig", utm_medium: "social" },
    });
    assert.equal(message.subject, "Your PowAlert adult ski camps guide");
    assert.match(message.text, /Hi Pat/);
    assert.match(message.text, /See PowAlert: https:\/\/powalert\.com\/go\?/);
    assert.match(message.ctaUrl, /from=adult-ski-camps/);
    assert.match(message.ctaUrl, /utm_source=ig/);
    assert.match(message.ctaUrl, /utm_medium=social/);
    assert.match(message.html, /See PowAlert/);
    assert.match(message.html, /from=adult-ski-camps/);
    assert.match(message.html, /utm_source=ig/);
  });
});

describe("POST /api/leads", () => {
  it("saves a lead then sends HTML, and keeps consent false as a timestamp-less opt-out", async () => {
    const { res, leads, sends } = await post(validBody({ consent: false, name: "" }));
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { ok: true });
    assert.equal(leads.rows.length, 1);
    const row = leads.rows[0];
    assert.equal(row.email, "pat@powalert.com");
    assert.equal(row.phone, "+17205550100");
    assert.equal(row.consent, false);
    assert.equal(row.consentAt, null);
    assert.equal(row.ref, "friend");
    assert.equal(row.userAgent, "TestAgent/1.0");
    assert.equal(row.ipHash, hashClientIp("203.0.113.10", "test-salt"));
    assert.equal(row.ipHash.length, 64);
    assert.equal(row.emailStatus, "sent");
    assert.equal(sends.length, 1);
    assert.equal(sends[0][0], "pat@powalert.com");
    assert.match(sends[0][2], /See PowAlert: https:\/\/powalert\.com\/go\?/);
    assert.match(sends[0][3].html, /href="https:\/\/powalert\.com\/go"/);
    assert.match(sends[0][3].html, /<table /);
    assert.match(sends[0][3].html, /from=ski-vanlife/);
    assert.match(sends[0][3].html, /utm_source=newsletter/);
  });

  it("stores consentAt only when consent is true", async () => {
    const now = 1_700_000_000_000;
    const { leads } = await post(validBody({ consent: true }), { now });
    assert.equal(leads.rows[0].consent, true);
    assert.equal(leads.rows[0].consentAt.toISOString(), new Date(now).toISOString());
  });

  it("returns 400 and does not save or send when the guide is not allow-listed", async () => {
    const { res, leads, sends } = await post(validBody({ guide: "nope" }));
    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, { ok: false, error: "guide is not available" });
    assert.equal(leads.rows.length, 0);
    assert.equal(sends.length, 0);
  });

  it("dedupes the same email + guide inside the window and does not send again", async () => {
    const leads = fakeLeads();
    const store = createMemoryStore();
    const now = 1_700_000_000_000;
    const first = await post(validBody(), { leads, store, now });
    const second = await post(validBody({ email: "PAT@powalert.com", turnstileToken: "tok-2" }), {
      leads,
      store,
      now: now + 1000,
    });
    assert.equal(first.res.statusCode, 200);
    assert.equal(second.res.statusCode, 200);
    assert.deepEqual(second.res.body, { ok: true });
    assert.equal(leads.rows.length, 1);
    assert.equal(first.sends.length, 1);
    assert.equal(second.sends.length, 0);
  });

  it("creates a new row for a different guide, and again after the dedupe window", async () => {
    const leads = fakeLeads();
    const store = createMemoryStore();
    const now = 1_700_000_000_000;
    const env = { ...prodEnv, LEAD_EMAIL_MAX: "10" };
    await post(validBody(), { leads, store, now, env });
    const otherGuide = await post(validBody({ guide: "adult-ski-camps", turnstileToken: "tok-b" }), {
      leads,
      store,
      now: now + 1000,
      env,
    });
    const later = await post(validBody({ turnstileToken: "tok-c" }), {
      leads,
      store,
      now: now + DEFAULT_LEAD_DEDUPE_WINDOW_MS + 5,
      env,
    });
    assert.equal(otherGuide.res.statusCode, 200);
    assert.equal(later.res.statusCode, 200);
    assert.equal(leads.rows.length, 3);
    assert.equal(otherGuide.sends.length, 1);
    assert.equal(later.sends.length, 1);
    assert.match(otherGuide.sends[0][3].html, /from=adult-ski-camps/);
  });

  it("rate-limits per email and per IP", async () => {
    const emailStore = createMemoryStore();
    const emailEnv = { ...prodEnv, LEAD_EMAIL_MAX: "1", LEAD_IP_MAX: "20" };
    const first = await post(validBody(), { store: emailStore, env: emailEnv, ip: "203.0.113.1" });
    const sameEmail = await post(validBody({ guide: "adult-ski-camps" }), {
      store: emailStore,
      env: emailEnv,
      ip: "203.0.113.2",
    });
    const otherEmail = await post(validBody({ email: "other@powalert.com" }), {
      store: emailStore,
      env: emailEnv,
      ip: "203.0.113.3",
    });
    assert.equal(first.res.statusCode, 200);
    assert.equal(sameEmail.res.statusCode, 429);
    assert.equal(sameEmail.res.body.ok, false);
    assert.equal(sameEmail.res.body.error, "Too many attempts. Try again in a moment.");
    assert.equal(sameEmail.res.headers["Retry-After"], String(sameEmail.res.body.retryAfter));
    assert.equal(sameEmail.leads.rows.length, 0);
    assert.equal(otherEmail.res.statusCode, 200);

    const ipStore = createMemoryStore();
    const ipEnv = { ...prodEnv, LEAD_IP_MAX: "2", LEAD_EMAIL_MAX: "20" };
    let last;
    for (let i = 0; i < 3; i += 1) {
      last = await post(validBody({ email: `person${i}@powalert.com` }), {
        store: ipStore,
        env: ipEnv,
        ip: "198.51.100.8",
      });
    }
    assert.equal(last.res.statusCode, 429);
    assert.equal(last.sends.length, 0);
  });

  it("opens the window again after it expires", () => {
    const store = createMemoryStore();
    const env = { LEAD_EMAIL_MAX: "1", LEAD_EMAIL_WINDOW_MS: "1000", LEAD_IP_MAX: "10" };
    const now = 5_000_000;
    assert.equal(
      checkLeadRateLimit({ ip: "203.0.113.9", email: "pat@powalert.com", store, env, now }).ok,
      true
    );
    assert.equal(
      checkLeadRateLimit({
        ip: "203.0.113.9",
        email: "pat@powalert.com",
        store,
        env,
        now: now + 10,
      }).ok,
      false
    );
    assert.equal(
      checkLeadRateLimit({
        ip: "203.0.113.9",
        email: "pat@powalert.com",
        store,
        env,
        now: now + 1011,
      }).ok,
      true
    );
    assert.equal(leadLimits({ LEAD_EMAIL_MAX: "0", LEAD_IP_MAX: "nope" }).email.max, LEAD_RATE_LIMITS.email.max);
    assert.equal(leadDedupeWindowMs({}), DEFAULT_LEAD_DEDUPE_WINDOW_MS);
  });

  it("rejects a failed Turnstile token with 403 and does not save", async () => {
    let called = false;
    const { res, leads, sends } = await post(validBody({ turnstileToken: "bad" }), {
      fetchImpl: async (url, init) => {
        called = true;
        assert.equal(url, TURNSTILE_SITEVERIFY_URL);
        const payload = JSON.parse(init.body);
        assert.equal(payload.secret, "0xsecret");
        assert.equal(payload.response, "bad");
        assert.equal(payload.remoteip, "203.0.113.10");
        return { json: async () => ({ success: false }) };
      },
    });
    assert.equal(called, true);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.ok, false);
    assert.equal(res.body.code, "turnstile_failed");
    assert.equal(leads.rows.length, 0);
    assert.equal(sends.length, 0);
  });

  it("requires a token when the secret is set, and fail-closes in production when the secret is missing", async () => {
    const missingToken = await post(validBody({ turnstileToken: "" }), {
      fetchImpl: async () => {
        throw new Error("should not call siteverify without a token");
      },
    });
    assert.equal(missingToken.res.statusCode, 403);
    assert.equal(missingToken.res.body.code, "turnstile_required");
    assert.equal(missingToken.leads.rows.length, 0);

    const noSecret = await post(validBody(), {
      env: { NODE_ENV: "production" },
      fetchImpl: async () => {
        throw new Error("should not call siteverify without a secret");
      },
    });
    assert.equal(noSecret.res.statusCode, 403);
    assert.equal(noSecret.res.body.code, "turnstile_unavailable");
    assert.equal(noSecret.leads.rows.length, 0);

    const unsetNodeEnv = await post(validBody(), {
      env: {},
      fetchImpl: async () => {
        throw new Error("unset NODE_ENV must not skip");
      },
    });
    assert.equal(unsetNodeEnv.res.statusCode, 403);
    assert.equal(unsetNodeEnv.res.body.code, "turnstile_unavailable");
  });

  it("skips Turnstile outside production when the secret is unset, and still verifies when the secret is set", async () => {
    assert.equal(leadTurnstileMode({ NODE_ENV: "test" }).mode, "skip");
    assert.equal(leadTurnstileMode({ NODE_ENV: "development" }).mode, "skip");
    assert.equal(
      leadTurnstileMode({ NODE_ENV: "test", TURNSTILE_SECRET_KEY: "0xsecret" }).mode,
      "verify"
    );
    assert.equal(leadTurnstileMode({ NODE_ENV: "production" }).mode, "unavailable");

    const skipped = await post(validBody({ turnstileToken: "" }), {
      env: { NODE_ENV: "test" },
      fetchImpl: async () => {
        throw new Error("siteverify should not run");
      },
    });
    assert.equal(skipped.res.statusCode, 200);
    assert.equal(skipped.leads.rows.length, 1);
    assert.equal(skipped.sends.length, 1);
  });

  it("drops a filled honeypot without saving or sending", async () => {
    const { res, leads, sends } = await post(validBody({ powalert_hp: "https://spam.example" }), {
      env: { NODE_ENV: "production" },
      fetchImpl: async () => {
        throw new Error("honeypot should return before Turnstile");
      },
    });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { ok: true });
    assert.equal(leads.rows.length, 0);
    assert.equal(sends.length, 0);
  });

  it("returns 200 after a send failure and keeps the lead", async () => {
    const { res, leads } = await post(validBody(), {
      sendEmail: async () => {
        throw new Error("sendgrid down");
      },
    });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { ok: true });
    assert.equal(leads.rows.length, 1);
    assert.equal(leads.rows[0].emailStatus, "failed");
    assert.match(leads.rows[0].emailError, /sendgrid down/);
  });

  it("returns 500 when the save itself fails", async () => {
    const leads = fakeLeads();
    leads.create = async () => {
      throw new Error("mongo down");
    };
    const { res, sends } = await post(validBody(), { leads });
    assert.equal(res.statusCode, 500);
    assert.equal(res.body.ok, false);
    assert.equal(res.body.error, "Could not save your request. Try again.");
    assert.equal(sends.length, 0);
  });
});

describe("leads collection and public wiring", () => {
  it("uses the leads collection and the guide allowlist", () => {
    assert.equal(Lead.collection.collectionName, "leads");
    const ok = new Lead({
      email: "pat@powalert.com",
      guide: "ski-vanlife",
      consent: true,
    });
    assert.equal(ok.validateSync(), undefined);
    const bad = new Lead({ email: "pat@powalert.com", guide: "nope", consent: false });
    assert.ok(bad.validateSync());
  });

  it("allows powalert.com, Netlify previews, localhost, and ORIGIN", () => {
    assert.equal(isAllowedCorsOrigin("https://powalert.com"), true);
    assert.equal(isAllowedCorsOrigin("https://www.powalert.com"), true);
    assert.equal(
      isAllowedCorsOrigin("https://deploy-preview-12--powalert.netlify.app"),
      true
    );
    assert.equal(isAllowedCorsOrigin("https://main--powalert.netlify.app"), true);
    assert.equal(isAllowedCorsOrigin("http://localhost:5173"), true);
    assert.equal(
      isAllowedCorsOrigin("https://staging.example.com", {
        ORIGIN: "https://staging.example.com, https://other.example.com",
      }),
      true
    );
    assert.equal(isAllowedCorsOrigin(undefined), true);
    assert.equal(isAllowedCorsOrigin("https://evil.example"), false);
    assert.equal(isAllowedCorsOrigin("https://powalert.com.evil.example"), false);
    assert.equal(isAllowedCorsOrigin("http://foo.netlify.app"), false);
    assert.equal(isAllowedCorsOrigin("https://evil.netlify.app.attacker.com"), false);
  });

  it("mounts POST /api/leads without auth and does not touch storm SMS", () => {
    const index = readFileSync(join(root, "index.js"), "utf8");
    const routes = readFileSync(join(root, "api/lead.routes.js"), "utf8");
    const controller = readFileSync(join(root, "controllers/lead.controller.js"), "utf8");
    const sendgrid = readFileSync(join(root, "utils/sendgridService.js"), "utf8");
    const cron = readFileSync(join(root, "cron/visualCrossingCron.js"), "utf8");
    const gate = readFileSync(join(root, "utils/stormAlertGate.js"), "utf8");
    const weather = readFileSync(join(root, "services/weatherAlertService.js"), "utf8");

    assert.match(index, /app\.use\("\/api\/leads", leadRouter\)/);
    assert.match(index, /isAllowedCorsOrigin/);
    assert.match(index, /trust proxy["'], 1/);
    assert.match(routes, /leadRouter\.post\("\/", createLead\)/);
    assert.doesNotMatch(routes, /verifyToken/);
    assert.doesNotMatch(controller, /twilio|ENABLE_POWDER_ALERT_CRON|sendTextMessage/);
    assert.match(sendgrid, /hello@powalert\.com/);
    assert.match(sendgrid, /html/);
    assert.match(weather, /sendEmail\(user\.email, "PowAlerts", segment\)/);
    assert.match(cron, /ENABLE_POWDER_ALERT_CRON === "true"/);
    assert.doesNotMatch(cron, /ENABLE_POWDER_ALERT_CRON\s*=\s*"true"/);
    assert.match(gate, /STORM_ALERT_LEAD_DAYS = 16/);
  });
});
