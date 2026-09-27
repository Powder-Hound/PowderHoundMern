import { e164Phone } from "./phone.js";
import { isValidEmail, normalizeEmail } from "./email.js";
import { LEAD_GUIDE_SLUGS } from "./guideContent.js";

export const UTM_FIELDS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
];

/** Hidden field. Leave empty. A non-empty value is treated as a bot. */
export const HONEYPOT_FIELD = "powalert_hp";

export const LEAD_ERRORS = {
  emailRequired: "email is required",
  emailInvalid: "email is not a valid format",
  guideRequired: "guide is required",
  guideInvalid: "guide is not available",
  consentRequired: "consent is required",
  consentType: "consent must be a boolean",
  rateLimited: "Too many attempts. Try again in a moment.",
  saveFailed: "Could not save your request. Try again.",
};

const clip = (value, max) => String(value).trim().slice(0, max);

function optionalString(source, key, max) {
  if (!Object.hasOwn(source, key) || source[key] == null || source[key] === "") {
    return { ok: true, value: "" };
  }
  if (typeof source[key] !== "string") {
    return { ok: false, error: `${key} must be a string` };
  }
  return { ok: true, value: clip(source[key], max) };
}

export function honeypotTripped(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  if (!Object.hasOwn(body, HONEYPOT_FIELD)) return false;
  const value = body[HONEYPOT_FIELD];
  if (value == null) return false;
  if (typeof value !== "string") return true;
  return value.trim() !== "";
}

/**
 * Normalize a lead JSON body. Does not check Turnstile or rate limits.
 * Phone uses the same E.164 helper as /go (US NANP becomes +1…, other digit strings keep a single +).
 */
export function parseLeadBody(body) {
  const source = body && typeof body === "object" && !Array.isArray(body) ? body : {};

  if (
    !Object.hasOwn(source, "email") ||
    source.email == null ||
    !String(source.email).trim()
  ) {
    return { ok: false, error: LEAD_ERRORS.emailRequired };
  }
  const email = normalizeEmail(source.email);
  if (!isValidEmail(email) || email.length > 320) {
    return { ok: false, error: LEAD_ERRORS.emailInvalid };
  }

  if (
    !Object.hasOwn(source, "guide") ||
    source.guide == null ||
    !String(source.guide).trim()
  ) {
    return { ok: false, error: LEAD_ERRORS.guideRequired };
  }
  const guide = String(source.guide).trim();
  if (!LEAD_GUIDE_SLUGS.includes(guide)) {
    return { ok: false, error: LEAD_ERRORS.guideInvalid };
  }

  if (!Object.hasOwn(source, "consent")) {
    return { ok: false, error: LEAD_ERRORS.consentRequired };
  }
  if (typeof source.consent !== "boolean") {
    return { ok: false, error: LEAD_ERRORS.consentType };
  }

  const name = optionalString(source, "name", 80);
  if (!name.ok) return name;
  name.value = name.value.replace(/[\r\n]+/g, " ");
  const phoneRaw = optionalString(source, "phone", 40);
  if (!phoneRaw.ok) return phoneRaw;

  const utm = {};
  for (const key of UTM_FIELDS) {
    const parsed = optionalString(source, key, 200);
    if (!parsed.ok) return parsed;
    utm[key] = parsed.value;
  }

  const ref = optionalString(source, "ref", 64);
  if (!ref.ok) return ref;

  const phone = phoneRaw.value ? e164Phone(phoneRaw.value).slice(0, 20) : "";

  return {
    ok: true,
    value: {
      email,
      name: name.value,
      phone,
      guide,
      ...utm,
      ref: ref.value,
      consent: source.consent,
    },
  };
}
