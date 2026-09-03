import { e164Phone, usE164Phone } from "./phone.js";

const LOOKUP_UNCONFIRMED =
  "Twilio Lookup did not confirm this number; proceeding to Verify.";
const LOOKUP_UNAVAILABLE =
  "Twilio Lookup was unavailable; proceeding to Verify.";

const lookupErrorMessage = (lookupError) => {
  if (!lookupError) return "";
  if (typeof lookupError === "string") return lookupError;
  return (
    lookupError.message ||
    lookupError.status ||
    lookupError.code ||
    "Lookup failed"
  );
};

const resolvedE164 = (lookup, fallback) => {
  const fromLookup = lookup?.phoneNumber
    ? e164Phone(lookup.phoneNumber)
    : "";
  return fromLookup || fallback;
};

/**
 * Soft-gate Twilio Lookup for POST /api/auth/validate-phone.
 * Lookup `valid` is advisory only. A plausible US E.164 always proceeds
 * to Verify (`valid: true`) so the SPA can call send-verification-code.
 */
export const buildValidatePhoneResponse = ({
  input,
  lookup = null,
  lookupError = null,
} = {}) => {
  const phoneNumber = usE164Phone(input);
  if (!phoneNumber) {
    return {
      status: 400,
      body: {
        success: false,
        valid: false,
        message: input
          ? "Enter a US phone number that can receive SMS."
          : "phoneNumber is required",
      },
    };
  }

  const lookupValid = lookup?.valid === true;
  const body = {
    valid: true,
    phoneNumber: resolvedE164(lookup, phoneNumber),
    lookupValid,
  };

  if (lookup && !lookupValid) {
    body.warning = LOOKUP_UNCONFIRMED;
  }

  if (lookupError) {
    body.lookupError = lookupErrorMessage(lookupError);
    if (lookupError?.code != null) body.lookupErrorCode = lookupError.code;
    if (lookupError?.status != null) body.lookupErrorStatus = lookupError.status;
    if (!body.warning) body.warning = LOOKUP_UNAVAILABLE;
  }

  return { status: 200, body };
};

export const createValidatePhoneNumber = (lookupFetch) => {
  return async (req, res) => {
    const input = req.body?.phoneNumber;
    const to = usE164Phone(input);
    if (!to) {
      const { status, body } = buildValidatePhoneResponse({ input });
      return res.status(status).send(body);
    }

    try {
      const lookup = await lookupFetch(to);
      const { status, body } = buildValidatePhoneResponse({ input, lookup });
      return res.status(status).send(body);
    } catch (error) {
      console.log(error);
      const { status, body } = buildValidatePhoneResponse({
        input,
        lookupError: error,
      });
      return res.status(status).send(body);
    }
  };
};
