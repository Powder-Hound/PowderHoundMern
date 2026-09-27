import { User } from "../models/users.model.js";
import {
  isOnAdminAllowlist,
  parseAdminPhoneAllowlist,
} from "../utils/adminCrm.js";

/**
 * Fail-closed CRM gate. JWT `permissions` is not enough (verifyToken
 * ignores expiration and copies the claim from the payload).
 *
 * Requires:
 *   1. A valid Bearer token (verifyToken already ran)
 *   2. ADMIN_PHONE_ALLOWLIST containing at least one phone
 *   3. Live users.permissions === "admin"
 *   4. That user's phoneNumber on the allow-list
 */
export const requireAdminCrm = async (req, res, next) => {
  try {
    const allowlist = parseAdminPhoneAllowlist();
    if (allowlist.size === 0) {
      return res.status(403).send({
        success: false,
        message: "Admin allow-list is not configured",
      });
    }

    if (!req.userID) {
      return res.status(401).send({
        success: false,
        message: "Unauthorized",
      });
    }

    const adminUser = await User.findById(req.userID).select(
      "permissions phoneNumber name"
    );
    if (!adminUser || adminUser.permissions !== "admin") {
      return res.status(403).send({
        success: false,
        message: "Admin access denied",
      });
    }

    if (!isOnAdminAllowlist(adminUser.phoneNumber, allowlist)) {
      return res.status(403).send({
        success: false,
        message: "Admin access denied",
      });
    }

    req.adminUser = adminUser;
    return next();
  } catch (error) {
    return res.status(500).send({
      success: false,
      message: "Error authorizing admin",
      error: error?.message || error,
    });
  }
};
