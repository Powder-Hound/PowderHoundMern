/** Last-season users store country+national digits (no +). Twilio Verify wants E.164. */

export const digitsPhone = (phone) => String(phone ?? "").replace(/\D/g, "");

export const e164Phone = (phone) => {
  const digits = digitsPhone(phone);
  return digits ? `+${digits}` : "";
};
