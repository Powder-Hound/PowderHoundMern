/**
 * Browser origins allowed to call this API.
 * powalert.com, Netlify deploy/branch previews (*.netlify.app), localhost,
 * and any exact origin in ORIGIN (comma-separated).
 * Requests with no Origin header (curl, mobile) are allowed.
 */

const POWALERT_ORIGINS = new Set([
  "https://powalert.com",
  "https://www.powalert.com",
]);

const NETLIFY_ORIGIN =
  /^https:\/\/[a-z0-9](?:[a-z0-9-]{0,200}[a-z0-9])?\.netlify\.app$/i;

const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(?::\d+)?$/;

const configuredOrigins = (env) => {
  const raw = String(env?.ORIGIN ?? "");
  return new Set(
    raw
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
  );
};

export function isAllowedCorsOrigin(origin, env = process.env) {
  if (!origin) return true;
  const value = String(origin).trim();
  if (!value) return true;
  if (POWALERT_ORIGINS.has(value)) return true;
  if (configuredOrigins(env).has(value)) return true;
  if (LOCAL_ORIGIN.test(value)) return true;
  if (NETLIFY_ORIGIN.test(value)) return true;
  return false;
}
