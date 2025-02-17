/**
 * smsUtils.js
 *
 * Utility function to split alert messages into SMS segments that
 * respect a specified character limit.
 */

/**
 * Splits an array of individual alert messages into SMS segments that are each below the character limit.
 * @param {string[]} alerts - The array of alert messages.
 * @param {number} [limit=1600] - The maximum number of characters per SMS segment.
 * @returns {string[]} - An array of SMS segments.
 */
export function splitAggregatedMessages(alerts, limit = 1600) {
  const separator = "\n\n----------------------\n\n";
  const segments = [];
  let currentSegment = "";

  for (const alert of alerts) {
    // If this is the first alert in the segment, add it without a separator.
    if (currentSegment === "") {
      if (alert.length > limit) {
        // If a single alert exceeds the limit, push it as its own segment.
        segments.push(alert);
      } else {
        currentSegment = alert;
      }
    } else {
      // Try appending the next alert with a separator.
      const candidate = currentSegment + separator + alert;
      if (candidate.length <= limit) {
        currentSegment = candidate;
      } else {
        // Save the current segment and start a new one.
        segments.push(currentSegment);
        currentSegment = alert;
      }
    }
  }

  // Push any remaining content as the last segment.
  if (currentSegment) {
    segments.push(currentSegment);
  }

  return segments;
}
