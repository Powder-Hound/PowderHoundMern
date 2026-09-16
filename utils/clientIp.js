/**
 * Client IP for OTP rate limits. Requires `app.set("trust proxy", 1)`
 * on Render so Express `req.ip` is the visitor, not the proxy.
 * Missing / unparseable addresses share the "unknown" bucket (fail closed).
 */
export function clientIp(req) {
  const raw = req?.ip || req?.socket?.remoteAddress || "";
  const ip = String(raw).replace(/^::ffff:/, "").trim();
  return ip || "unknown";
}
