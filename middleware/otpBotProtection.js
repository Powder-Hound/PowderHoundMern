import { e164Phone } from "../utils/phone.js";
import { clientIp } from "../utils/clientIp.js";
import {
  checkOtpRateLimit,
  getOtpRateLimitStore,
} from "../utils/otpRateLimit.js";
import {
  botProtectionPublicConfig,
  extractTurnstileToken,
  resolveTurnstilePolicy,
  verifyTurnstileToken,
} from "../utils/turnstile.js";

const rateLimitedBody = (retryAfterSec) => ({
  success: false,
  code: "rate_limited",
  message: "Too many attempts. Try again in a moment.",
  retryAfter: retryAfterSec,
});

export const createOtpProtection = ({
  action,
  requireTurnstile,
  store,
  env,
  fetchImpl,
  now,
} = {}) => {
  return async (req, res, next) => {
    const resolvedEnv = env || process.env;
    const resolvedStore = store || getOtpRateLimitStore();
    const ip = clientIp(req);
    const phone = e164Phone(req.body?.phoneNumber);

    if (requireTurnstile) {
      const policy = resolveTurnstilePolicy(resolvedEnv);
      if (policy.required) {
        const verdict = await verifyTurnstileToken({
          token: extractTurnstileToken(req),
          ip,
          secret: policy.secret,
          fetchImpl: fetchImpl || globalThis.fetch,
        });
        if (!verdict.ok) {
          return res.status(verdict.status).send(verdict.body);
        }
      }
    }

    const limited = checkOtpRateLimit({
      action,
      ip,
      phone,
      store: resolvedStore,
      env: resolvedEnv,
      now: typeof now === "function" ? now() : Date.now(),
    });
    if (!limited.ok) {
      res.set("Retry-After", String(limited.retryAfterSec));
      return res.status(429).send(rateLimitedBody(limited.retryAfterSec));
    }

    return next();
  };
};

export const otpValidateProtection = createOtpProtection({
  action: "validate",
  requireTurnstile: false,
});

export const otpSendProtection = createOtpProtection({
  action: "send",
  requireTurnstile: true,
});

export const otpVerifyProtection = createOtpProtection({
  action: "verify",
  requireTurnstile: false,
});

export const getBotProtectionConfig = (req, res) => {
  return res.status(200).send(botProtectionPublicConfig());
};
