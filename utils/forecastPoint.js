/**
 * One Visual Crossing timeline request per resort. A resort with a usable
 * forecastPoint is queried there; every other resort stays on Latitude/Longitude.
 * This never returns more than one coordinate pair.
 */

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function selectIngestCoordinates(resort) {
  const point = resort?.forecastPoint;
  const lat = finiteNumber(point?.lat);
  const lon = finiteNumber(point?.lon);
  if (lat != null && lon != null) {
    return {
      lat,
      lon,
      usedForecastPoint: true,
    };
  }
  return {
    lat: resort?.Latitude,
    lon: resort?.Longitude,
    usedForecastPoint: false,
  };
}

/**
 * Fields the public forecast payload exposes so the SPA can label
 * "Forecast at 8,700 ft (mid-mountain)". Null when the resort has no point.
 */
export function publicForecastPoint(resort) {
  const point = resort?.forecastPoint;
  const elevationFt = finiteNumber(point?.elevationFt);
  if (elevationFt == null) return null;
  const label = typeof point.label === "string" ? point.label.trim() : "";
  return {
    elevationFt,
    label: label || null,
  };
}

export function ingestCoordinatesForResorts(resorts) {
  return resorts.map((resort) => selectIngestCoordinates(resort));
}
