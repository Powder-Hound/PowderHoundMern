/** Last-season users store country+national digits (no +). Twilio Verify wants E.164. */

export const digitsPhone = (phone) => String(phone ?? "").replace(/\D/g, "");

/** NANP national number: NXX NXX XXXX (N=2-9). Optional leading country 1. */
const US_NANP = /^(?:1)?([2-9]\d{2}[2-9]\d{6})$/;

/** Plausible +1 E.164 for OTP. Empty when digits are not US/NANP-shaped. */
export const usE164Phone = (phone) => {
  const match = digitsPhone(phone).match(US_NANP);
  return match ? `+1${match[1]}` : "";
};

export const isPlausibleUsPhone = (phone) => Boolean(usE164Phone(phone));

/**
 * Single-plus E.164. US 10-digit / +1 NANP become +1XXXXXXXXXX.
 * Other digit strings keep a single leading + (never ++).
 */
export const e164Phone = (phone) => {
  const us = usE164Phone(phone);
  if (us) return us;
  const digits = digitsPhone(phone);
  return digits ? `+${digits}` : "";
};
