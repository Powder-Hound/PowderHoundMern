/**
 * Pure planning for the mid-mountain forecastPoint migration.
 * Dry-run uses this against data/resorts.json. Nothing here opens a database.
 */

export function resortIdOf(resort) {
  if (resort?._id?.$oid) return String(resort._id.$oid);
  if (resort?._id != null) return String(resort._id);
  return "";
}

export function forecastPointFromRecord(record) {
  const point = record.forecastPoint;
  return {
    lat: point.lat,
    lon: point.lon,
    elevationFt: point.elevationFt,
    label: point.label,
    source: point.source,
  };
}

export function sameForecastPoint(left, right) {
  if (!left && !right) return true;
  if (!left || !right) return false;
  return (
    left.lat === right.lat &&
    left.lon === right.lon &&
    left.elevationFt === right.elevationFt &&
    left.label === right.label &&
    left.source === right.source
  );
}

export function planForecastPointMigration(resorts, records) {
  const byId = new Map(resorts.map((resort) => [resortIdOf(resort), resort]));
  const changes = [];
  const unchanged = [];
  const missing = [];
  const nameMismatches = [];

  for (const record of records) {
    const resort = byId.get(String(record.resortId));
    if (!resort) {
      missing.push({
        resortId: record.resortId,
        resortName: record.resortName,
      });
      continue;
    }
    if (resort.resortName !== record.resortName) {
      nameMismatches.push({
        resortId: record.resortId,
        expected: record.resortName,
        actual: resort.resortName,
      });
      continue;
    }
    const next = forecastPointFromRecord(record);
    if (sameForecastPoint(resort.forecastPoint, next)) {
      unchanged.push({
        resortId: record.resortId,
        resortName: record.resortName,
      });
      continue;
    }
    changes.push({
      resortId: record.resortId,
      resortName: record.resortName,
      oldLat: resort.Latitude,
      oldLon: resort.Longitude,
      oldElevationFt: record.current?.elevationFt ?? null,
      next,
      namedFeature: record.namedFeature || null,
    });
  }

  return { changes, unchanged, missing, nameMismatches };
}

export function applyForecastPoint(resort, record) {
  return {
    ...resort,
    Latitude: resort.Latitude,
    Longitude: resort.Longitude,
    forecastPoint: forecastPointFromRecord(record),
  };
}

/**
 * Default is dry-run. --apply writes only when NODE_ENV is not production
 * and the caller passed --confirm-not-production.
 */
export function applyGuard(argv, env = process.env) {
  if (!argv.includes("--apply")) return { apply: false };
  if (env.NODE_ENV === "production") {
    return { apply: false, reason: "NODE_ENV is production" };
  }
  if (!argv.includes("--confirm-not-production")) {
    return {
      apply: false,
      reason: "missing --confirm-not-production",
    };
  }
  return { apply: true };
}

export function formatDryRunTable(changes) {
  const header = [
    "| Resort | Old coords | Old elevation (ft) | New coords | New elevation (ft) | Source |",
    "| --- | --- | ---: | --- | ---: | --- |",
  ];
  const lines = changes.map((change) => {
    const oldCoords = `${change.oldLat}, ${change.oldLon}`;
    const newCoords = `${change.next.lat}, ${change.next.lon}`;
    const source = change.namedFeature
      ? `${change.namedFeature}; ${change.next.source}`
      : change.next.source;
    return `| ${change.resortName} | ${oldCoords} | ${change.oldElevationFt ?? ""} | ${newCoords} | ${change.next.elevationFt} | ${source} |`;
  });
  return [...header, ...lines].join("\n");
}
