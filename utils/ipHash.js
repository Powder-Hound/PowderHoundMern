import { createHash } from "node:crypto";

/** Stable hash for abuse review. Raw IPs are not stored on leads. */
export function hashClientIp(ip, salt = "") {
  const value = String(ip || "").trim();
  if (!value || value === "unknown") return "";
  const pepper = String(salt || "powalert-leads");
  return createHash("sha256").update(`${pepper}|${value}`).digest("hex");
}
