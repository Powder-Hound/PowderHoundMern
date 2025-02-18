/**
 * Splits an array of email alert messages into segments that are each below the character limit.
 * Uses the same separator as the SMS function.
 * @param {string[]} alerts - The array of alert messages.
 * @param {number} [limit=1600] - The maximum number of characters per email segment.
 * @returns {string[]} - An array of email segments.
 */
export function splitAggregatedEmailMessages(alerts, limit = 1600) {
  const separator = "\n\n----------------------\n\n";
  const segments = [];
  let currentSegment = "";

  for (const alert of alerts) {
    if (!currentSegment) {
      // If the alert itself exceeds the limit, push it as its own segment.
      if (alert.length > limit) {
        segments.push(alert);
      } else {
        currentSegment = alert;
      }
    } else {
      const candidate = currentSegment + separator + alert;
      if (candidate.length <= limit) {
        currentSegment = candidate;
      } else {
        segments.push(currentSegment);
        currentSegment = alert;
      }
    }
  }

  if (currentSegment) {
    segments.push(currentSegment);
  }

  return segments;
}
