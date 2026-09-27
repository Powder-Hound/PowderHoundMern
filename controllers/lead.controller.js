import { clientIp } from "../utils/clientIp.js";
import { buildGuideEmail, loadGuideMarkdown } from "../utils/guideContent.js";
import { hashClientIp } from "../utils/ipHash.js";
import {
  checkLeadRateLimit,
  getLeadRateLimitStore,
  leadDedupeWindowMs,
} from "../utils/leadRateLimit.js";
import { honeypotTripped, LEAD_ERRORS, parseLeadBody } from "../utils/leadInput.js";
import {
  leadTurnstileMode,
  warnLeadTurnstileSkipped,
} from "../utils/leadTurnstile.js";
import { normalizeEmail } from "../utils/email.js";
import { extractTurnstileToken, verifyTurnstileToken } from "../utils/turnstile.js";

const RATE_LIMIT_MESSAGE = LEAD_ERRORS.rateLimited;

async function mongoLeads() {
  const { Lead } = await import("../models/lead.model.js");
  return {
    findRecent({ email, guide, since }) {
      return Lead.findOne({
        email,
        guide,
        createdAt: { $gte: since },
      })
        .sort({ createdAt: -1 })
        .lean();
    },
    async create(doc) {
      const row = await Lead.create(doc);
      return row.toObject();
    },
    async markEmail(id, patch) {
      if (!id) return;
      await Lead.updateOne({ _id: id }, { $set: patch });
    },
  };
}

async function defaultSendEmail(to, subject, text, options) {
  const { sendEmail } = await import("../utils/sendgridService.js");
  return sendEmail(to, subject, text, options);
}

function userAgentOf(req) {
  const raw = req?.headers?.["user-agent"] || req?.headers?.["User-Agent"] || "";
  return String(raw).slice(0, 512);
}

function json(res, status, body) {
  return res.status(status).json(body);
}

/**
 * POST /api/leads
 * Express passes `next` as the third argument. Tests pass a deps object instead.
 *
 * Order: rate limit, honeypot, Turnstile, validation, dedupe, save, then email.
 * Email failure is logged and still returns 200. The lead row is already saved.
 */
export async function createLead(req, res, deps) {
  const options = deps && typeof deps === "object" ? deps : {};
  const env = options.env || process.env;
  const now = typeof options.now === "number" ? options.now : Date.now();
  const body = req?.body && typeof req.body === "object" ? req.body : {};

  try {
    const ip = clientIp(req);
    const emailKey = normalizeEmail(body.email).slice(0, 320);
    const limited = checkLeadRateLimit({
      ip,
      email: emailKey,
      store: options.store || getLeadRateLimitStore(),
      env,
      now,
    });
    if (!limited.ok) {
      res.set("Retry-After", String(limited.retryAfterSec));
      return json(res, 429, {
        ok: false,
        error: RATE_LIMIT_MESSAGE,
        retryAfter: limited.retryAfterSec,
      });
    }

    if (honeypotTripped(body)) {
      return json(res, 200, { ok: true });
    }

    const turnstile = leadTurnstileMode(env);
    if (turnstile.mode === "skip") {
      warnLeadTurnstileSkipped(options.warn || console.warn);
    } else if (turnstile.mode === "unavailable") {
      return json(res, 403, {
        ok: false,
        error: "Bot protection is not configured.",
        code: "turnstile_unavailable",
      });
    } else {
      const verdict = await verifyTurnstileToken({
        token: extractTurnstileToken(req),
        ip,
        secret: turnstile.secret,
        fetchImpl: options.fetchImpl || globalThis.fetch,
      });
      if (!verdict.ok) {
        return json(res, verdict.status, {
          ok: false,
          error: verdict.body.message,
          code: verdict.body.code,
        });
      }
    }

    const parsed = parseLeadBody(body);
    if (!parsed.ok) {
      return json(res, 400, { ok: false, error: parsed.error });
    }

    const leads = options.leads || (await mongoLeads());
    const since = new Date(now - leadDedupeWindowMs(env));
    const existing = await leads.findRecent({
      email: parsed.value.email,
      guide: parsed.value.guide,
      since,
    });
    if (existing) {
      return json(res, 200, { ok: true });
    }

    const createdAt = new Date(now);
    const saved = await leads.create({
      ...parsed.value,
      consentAt: parsed.value.consent ? createdAt : null,
      ipHash: hashClientIp(ip, env.LEAD_IP_HASH_SALT),
      userAgent: userAgentOf(req),
      emailStatus: "pending",
      emailError: "",
      createdAt,
    });

    try {
      const load = options.loadGuideMarkdown || loadGuideMarkdown;
      const markdown = load(parsed.value.guide);
      const message = buildGuideEmail({
        guide: parsed.value.guide,
        markdown,
        name: parsed.value.name,
        utm: parsed.value,
      });
      const send = options.sendEmail || defaultSendEmail;
      await send(parsed.value.email, message.subject, message.text, {
        html: message.html,
      });
      await leads.markEmail(saved._id, { emailStatus: "sent", emailError: "" });
    } catch (err) {
      console.error("guide email failed", {
        guide: parsed.value.guide,
        message: err?.message,
      });
      try {
        await leads.markEmail(saved._id, {
          emailStatus: "failed",
          emailError: String(err?.message || "send failed").slice(0, 300),
        });
      } catch (markErr) {
        console.error("lead email status update failed", markErr?.message);
      }
    }

    return json(res, 200, { ok: true });
  } catch (err) {
    console.error("lead capture failed", err?.message);
    if (!res.headersSent) {
      return json(res, 500, { ok: false, error: LEAD_ERRORS.saveFailed });
    }
  }
}
