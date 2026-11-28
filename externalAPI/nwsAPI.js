import { fetchJsonWithRetry } from "../utils/httpRetry.js";
import {
  formatNwsCoordinate,
  nwsDailyInches,
} from "../utils/nwsSnow.js";

const DEFAULT_CONTACT = "forecast@powalert.com";

export function nwsContactEmail(env = process.env) {
  const email =
    typeof env.NWS_CONTACT_EMAIL === "string" ? env.NWS_CONTACT_EMAIL.trim() : "";
  return email || DEFAULT_CONTACT;
}

export function nwsUserAgent(env = process.env) {
  return `PowAlert snow-blend (${nwsContactEmail(env)})`;
}

function samePoint(grid, lat, lon) {
  if (!grid?.wfo || grid.gridX == null || grid.gridY == null || !grid.timeZone) {
    return false;
  }
  return (
    Number(grid.lat).toFixed(4) === Number(lat).toFixed(4) &&
    Number(grid.lon).toFixed(4) === Number(lon).toFixed(4)
  );
}

function tally(counts, kind) {
  if (!counts) return;
  counts.nwsRequests = (counts.nwsRequests || 0) + 1;
  if (kind === "points") counts.nwsPointsRequests = (counts.nwsPointsRequests || 0) + 1;
  if (kind === "grid") counts.nwsGridRequests = (counts.nwsGridRequests || 0) + 1;
}

/**
 * One /points lookup when the resort has no cached grid for these coordinates,
 * then one /gridpoints fetch. Each HTTP attempt, including retries, increments
 * counts.nwsRequests. The caller fail-softs a thrown error per resort.
 */
export async function fetchNwsSnow({
  resortId,
  lat,
  lon,
  cache,
  counts,
  fetchImpl = globalThis.fetch,
  env = process.env,
  sleepImpl,
  attempts = 3,
}) {
  const flatLat = formatNwsCoordinate(lat);
  const flatLon = formatNwsCoordinate(lon);
  const headers = {
    Accept: "application/geo+json",
    "User-Agent": nwsUserAgent(env),
  };
  const countingFetch = async (url, options) => {
    const target = String(url);
    if (target.includes("/points/")) tally(counts, "points");
    else if (target.includes("/gridpoints/")) tally(counts, "grid");
    else tally(counts, "other");
    return fetchImpl(url, options);
  };
  const request = (url) =>
    fetchJsonWithRetry(url, {
      fetchImpl: countingFetch,
      headers,
      attempts,
      sleepImpl,
      label: "NWS",
    });

  let grid = null;
  try {
    grid = await cache.get(resortId);
  } catch {
    grid = null;
  }
  if (!samePoint(grid, flatLat, flatLon)) {
    const pointsUrl = `https://api.weather.gov/points/${flatLat},${flatLon}`;
    const points = await request(pointsUrl);
    const props = points?.properties || {};
    if (
      !props.gridId ||
      props.gridX == null ||
      props.gridY == null ||
      !props.timeZone
    ) {
      throw new Error("NWS points response missing grid");
    }
    grid = {
      resortId,
      lat: flatLat,
      lon: flatLon,
      wfo: props.gridId,
      gridX: props.gridX,
      gridY: props.gridY,
      timeZone: props.timeZone,
    };
    try {
      await cache.set(grid);
    } catch {
      // This run still uses the grid. The next run calls /points again.
    }
  }

  const gridUrl = `https://api.weather.gov/gridpoints/${encodeURIComponent(grid.wfo)}/${grid.gridX},${grid.gridY}`;
  const gridBody = await request(gridUrl);
  const snowfall = gridBody?.properties?.snowfallAmount;
  const days = nwsDailyInches(snowfall, grid.timeZone).map((day) => ({
    date: day.date,
    inches: day.inches,
  }));
  return {
    timeZone: grid.timeZone,
    issuedAt: gridBody?.properties?.updateTime || new Date().toISOString(),
    days,
  };
}
