/**
 * Lead-capture Turnstile policy.
 *
 * TURNSTILE_SECRET_KEY set: always verify the token (every environment).
 * Secret unset and NODE_ENV is development, test, or local: warn and skip.
 * Secret unset anywhere else, including production and an unset NODE_ENV: 403.
 *
 * This is intentionally looser in dev than PR #55's OTP policy, which fail-closes
 * unless TURNSTILE_SKIP=true. Leads do not read TURNSTILE_SKIP.
 */

const DEV_ENVS = new Set(["development", "test", "local"]);

const trimmed = (value) => String(value ?? "").trim();

let warned = false;

export function resetLeadTurnstileWarning() {
  warned = false;
}

export function leadTurnstileMode(env = process.env) {
  const secret = trimmed(env.TURNSTILE_SECRET_KEY);
  if (secret) {
    return { mode: "verify", secret };
  }
  if (DEV_ENVS.has(env.NODE_ENV)) {
    return { mode: "skip" };
  }
  return { mode: "unavailable" };
}

export function warnLeadTurnstileSkipped(warn = console.warn) {
  if (warned) return;
  warned = true;
  warn(
    "TURNSTILE_SECRET_KEY is unset; skipping lead Turnstile verification (NODE_ENV is development, test, or local)."
  );
}
