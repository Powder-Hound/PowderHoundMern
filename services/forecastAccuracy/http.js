import { USER_AGENT } from "./constants.js";

export function redactSecrets(value) {
  return String(value).replace(/key=[^&\s]+/gi, "key=REDACTED");
}

export async function fetchJson(url, { headers = {}, timeoutMs = 45000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": USER_AGENT,
        ...headers,
      },
      signal: ctrl.signal,
    });
    const text = await response.text();
    let body = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }
    if (!response.ok) {
      const detail =
        typeof body === "string" ? body.slice(0, 180) : JSON.stringify(body)?.slice(0, 180);
      const error = new Error(
        redactSecrets(`HTTP ${response.status} ${response.statusText} ${detail || ""}`.trim())
      );
      error.status = response.status;
      throw error;
    }
    return body;
  } catch (err) {
    if (err?.name === "AbortError") {
      throw new Error(`Request timed out after ${timeoutMs}ms`);
    }
    if (err instanceof Error) {
      err.message = redactSecrets(err.message);
      throw err;
    }
    throw new Error(redactSecrets(err));
  } finally {
    clearTimeout(timer);
  }
}
