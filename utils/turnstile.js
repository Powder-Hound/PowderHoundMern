/**
 * Cloudflare Turnstile siteverify + env policy for public OTP routes.
 *
 * Production always requires a valid token when TURNSTILE_SECRET_KEY is set.
 * TURNSTILE_SKIP=true is honored only when NODE_ENV !== "production".
 * Missing secret is fail-closed (do not send SMS) unless skip is explicit.
 */

export const TURNSTILE_SITEVERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";
export const TURNSTILE_TOKEN_MAX_LENGTH = 2048;
export const TURNSTILE_TOKEN_FIELD = "turnstileToken";

const trimmed = (value) => String(value ?? "").trim();

export const extractTurnstileToken = (req) => {
  const body = req?.body || {};
  const headers = req?.headers || {};
  const raw =
    body.turnstileToken ??
    body["cf-turnstile-response"] ??
    body.cfTurnstileResponse ??
    headers["cf-turnstile-response"] ??
    "";
  return trimmed(raw);
};

export const resolveTurnstilePolicy = (env = process.env) => {
  const secret = trimmed(env.TURNSTILE_SECRET_KEY);
  const siteKey = trimmed(env.TURNSTILE_SITE_KEY);
  const isProd = env.NODE_ENV === "production";
  const skipRequested = env.TURNSTILE_SKIP === "true";

  if (skipRequested && !isProd) {
    return {
      required: false,
      skip: true,
      secret: "",
      siteKey,
      reason: "explicit_skip",
    };
  }

  if (secret) {
    return {
      required: true,
      skip: false,
      secret,
      siteKey,
      reason: "secret_present",
    };
  }

  return {
    required: true,
    skip: false,
    secret: "",
    siteKey,
    reason: "missing_secret",
    failClosedMissingSecret: true,
  };
};

export const botProtectionPublicConfig = (env = process.env) => {
  const policy = resolveTurnstilePolicy(env);
  return {
    turnstileRequired: policy.required,
    siteKey: policy.siteKey,
    tokenField: TURNSTILE_TOKEN_FIELD,
  };
};

const fail = (status, code, message, extra = {}) => ({
  ok: false,
  status,
  body: {
    success: false,
    code,
    message,
    ...extra,
  },
});

export const verifyTurnstileToken = async ({
  token,
  ip,
  secret,
  fetchImpl = globalThis.fetch,
  timeoutMs = 5000,
} = {}) => {
  if (!secret) {
    return fail(
      403,
      "turnstile_unavailable",
      "Bot protection is not configured."
    );
  }

  const responseToken = trimmed(token);
  if (!responseToken) {
    return fail(
      403,
      "turnstile_required",
      "Complete the bot check and try again."
    );
  }
  if (responseToken.length > TURNSTILE_TOKEN_MAX_LENGTH) {
    return fail(403, "turnstile_failed", "Bot check failed. Try again.");
  }

  if (typeof fetchImpl !== "function") {
    return fail(
      403,
      "turnstile_unavailable",
      "Bot protection is not configured."
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(TURNSTILE_SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret,
        response: responseToken,
        ...(ip && ip !== "unknown" ? { remoteip: ip } : {}),
      }),
      signal: controller.signal,
    });
    const result = await res.json().catch(() => null);
    if (result?.success === true) {
      return { ok: true };
    }
    return fail(403, "turnstile_failed", "Bot check failed. Try again.");
  } catch {
    return fail(
      403,
      "turnstile_unavailable",
      "Bot check could not be completed. Try again in a moment."
    );
  } finally {
    clearTimeout(timer);
  }
};
