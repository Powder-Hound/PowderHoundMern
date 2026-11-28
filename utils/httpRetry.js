const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Retry network failures, HTTP 429, and HTTP 5xx. Other statuses throw
 * on the first response. Backoff is 500ms, 1000ms, 2000ms.
 */
export async function fetchJsonWithRetry(url, options = {}) {
  const {
    fetchImpl,
    headers,
    attempts = 3,
    sleepImpl = sleep,
    label = "HTTP",
  } = options;
  if (typeof fetchImpl !== "function") {
    throw new Error(`${label} fetch is not configured`);
  }
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetchImpl(url, { headers });
      if (response.ok) return await response.json();
      if (typeof response.text === "function") {
        await response.text().catch(() => {});
      }
      const error = new Error(`${label} HTTP ${response.status}`);
      error.status = response.status;
      if (response.status !== 429 && response.status < 500) throw error;
      lastError = error;
    } catch (error) {
      if (error?.status && error.status !== 429 && error.status < 500) throw error;
      lastError = error;
    }
    if (attempt < attempts - 1) {
      await sleepImpl(500 * 2 ** attempt);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`${label} request failed`);
}
