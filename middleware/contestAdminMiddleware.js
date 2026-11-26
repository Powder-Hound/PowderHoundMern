import jwt from "jsonwebtoken";
import { User } from "../models/users.model.js";
import {
  isOnAdminAllowlist,
  parseAdminPhoneAllowlist,
} from "../utils/adminCrm.js";

/** Matches login's expiresIn: "1h". Longer-lived JWTs are rejected. */
export const CONTEST_ADMIN_TOKEN_MAX_TTL_SECONDS = 60 * 60;

/**
 * Contest admin/draw tokens must expire and must not outlive 1 hour.
 * verifyToken() ignores expiration; do not use it here.
 * A token with no exp (createUser) or a multi-day exp is rejected.
 */
export function verifyExpiringAdminToken(
  token,
  secret = process.env.JWT_SECRET,
  nowSec = Math.floor(Date.now() / 1000)
) {
  if (!token || !secret) {
    return { ok: false, status: 401, reason: "missing_token" };
  }

  let decoded;
  try {
    decoded = jwt.verify(token, secret);
  } catch (error) {
    const reason =
      error?.name === "TokenExpiredError" ? "expired" : "invalid";
    return { ok: false, status: 401, reason };
  }

  if (!decoded?.userID) {
    return { ok: false, status: 401, reason: "invalid_payload" };
  }
  if (typeof decoded.exp !== "number" || typeof decoded.iat !== "number") {
    return { ok: false, status: 401, reason: "missing_expiry" };
  }
  if (decoded.exp - decoded.iat > CONTEST_ADMIN_TOKEN_MAX_TTL_SECONDS) {
    return { ok: false, status: 401, reason: "ttl_too_long" };
  }
  if (decoded.exp <= nowSec) {
    return { ok: false, status: 401, reason: "expired" };
  }

  return { ok: true, userID: String(decoded.userID), exp: decoded.exp };
}

/**
 * Live revocation: allow-list removal or permissions !== "admin"
 * takes effect on the next request even if the JWT has not expired.
 */
export function contestAdminDecision({ tokenCheck, allowlist, user }) {
  if (!tokenCheck?.ok) {
    return {
      ok: false,
      status: tokenCheck?.status || 401,
      reason: tokenCheck?.reason || "invalid",
    };
  }
  if (!allowlist || allowlist.size === 0) {
    return { ok: false, status: 403, reason: "allowlist_unconfigured" };
  }
  if (!user || user.permissions !== "admin") {
    return { ok: false, status: 403, reason: "not_admin" };
  }
  if (!isOnAdminAllowlist(user.phoneNumber, allowlist)) {
    return { ok: false, status: 403, reason: "not_allowlisted" };
  }
  return { ok: true };
}

export const requireContestAdmin = async (req, res, next) => {
  try {
    const header = req.headers?.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    const tokenCheck = verifyExpiringAdminToken(token);
    const allowlist = parseAdminPhoneAllowlist();

    let user = null;
    if (tokenCheck.ok) {
      user = await User.findById(tokenCheck.userID).select(
        "permissions phoneNumber name"
      );
    }

    const decision = contestAdminDecision({ tokenCheck, allowlist, user });
    if (!decision.ok) {
      return res.status(decision.status).send({
        success: false,
        message:
          decision.status === 403
            ? "Admin access denied"
            : "Admin token required",
        reason: decision.reason,
      });
    }

    req.userID = String(user._id);
    req.contestAdmin = user;
    req.adminUser = user;
    return next();
  } catch (error) {
    return res.status(500).send({
      success: false,
      message: "Error authorizing contest admin",
      error: error?.message || error,
    });
  }
};
