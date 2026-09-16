/**
 * Optional email for /go + preferences.
 * Entering an email is not marketing consent.
 */

const EMAIL_RE =
  /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

export const EMAIL_SOURCE_MAX = 64;

export function normalizeEmail(value) {
  if (value == null) return "";
  return String(value).trim().toLowerCase();
}

export function isValidEmail(value) {
  const normalized = normalizeEmail(value);
  return Boolean(normalized) && EMAIL_RE.test(normalized);
}

/** Empty / null / whitespace means "clear". Invalid format is not a clear. */
export function parseEmailInput(value) {
  if (value === undefined) {
    return { provided: false };
  }
  if (value === null) {
    return { provided: true, email: "", clear: true };
  }
  const normalized = normalizeEmail(value);
  if (!normalized) {
    return { provided: true, email: "", clear: true };
  }
  if (!EMAIL_RE.test(normalized)) {
    return { provided: true, email: normalized, invalid: true };
  }
  return { provided: true, email: normalized, clear: false };
}

export function normalizeEmailSource(value) {
  return String(value ?? "").trim().slice(0, EMAIL_SOURCE_MAX);
}

/**
 * Apply optional email + marketing-consent fields onto a $set payload.
 * Does not require email. Does not imply consent from an email value.
 * Server owns emailMarketingConsentAt.
 */
export function applyEmailPreferenceFields({
  body = {},
  existing = {},
  now = new Date(),
} = {}) {
  const next = {};
  const emailParse = parseEmailInput(body.email);

  if (emailParse.invalid) {
    return {
      ok: false,
      status: 400,
      message: "email is not a valid format",
    };
  }

  const existingEmail = normalizeEmail(existing.email);
  let email = existingEmail;
  let emailChanged = false;

  if (emailParse.provided) {
    email = emailParse.email;
    emailChanged = email !== existingEmail;
    next.email = email;
  }

  if (body.emailSource !== undefined) {
    next.emailSource = normalizeEmailSource(body.emailSource);
  }

  const consentProvided = Object.hasOwn(body, "emailMarketingConsent");
  let consent = Boolean(existing.emailMarketingConsent);

  if (emailChanged) {
    if (emailParse.clear) {
      consent = false;
      next.emailMarketingConsent = false;
      next.emailMarketingConsentAt = null;
    } else if (existingEmail && !consentProvided) {
      // A different address did not inherit the previous opt-in.
      consent = false;
      next.emailMarketingConsent = false;
      next.emailMarketingConsentAt = null;
    }
  }

  if (consentProvided) {
    if (emailParse.clear || !email) {
      next.emailMarketingConsent = false;
      next.emailMarketingConsentAt = null;
    } else {
      consent = Boolean(body.emailMarketingConsent);
      next.emailMarketingConsent = consent;
      next.emailMarketingConsentAt = consent ? now : null;
    }
  }

  return { ok: true, fields: next, email, consent };
}
