import {
  FORECAST_ACCURACY_SEASON,
  LEAD_BUCKETS,
  STORM_THRESHOLD_IN,
} from "./constants.js";

export function leadBucket(leadDays) {
  const lead = Number(leadDays);
  if (!Number.isFinite(lead)) return null;
  for (const bucket of LEAD_BUCKETS) {
    if (lead >= bucket.min && lead <= bucket.max) return bucket.id;
  }
  return null;
}

function round3(value) {
  if (value == null || Number.isNaN(value)) return null;
  return Math.round(value * 1000) / 1000;
}

function emptyStats() {
  return {
    n: 0,
    absError: 0,
    signedError: 0,
    hits: 0,
    misses: 0,
    falseAlarms: 0,
    quiet: 0,
  };
}

export function scoreForecasts(snapshots, observations, { stormInches = STORM_THRESHOLD_IN } = {}) {
  const obsByKey = new Map();
  for (const obs of observations || []) {
    if (!obs?.resort || !obs?.date) continue;
    obsByKey.set(`${obs.resort}|${obs.date}`, obs);
  }

  const skipped = { leadOutOfRange: 0, noSnowfall: 0, noObservation: 0 };
  const groups = new Map();

  for (const row of snapshots || []) {
    const bucket = leadBucket(row.leadDays);
    if (!bucket) {
      skipped.leadOutOfRange += 1;
      continue;
    }
    const snowfall = row.snowfallIn == null ? null : Number(row.snowfallIn);
    if (snowfall == null || !Number.isFinite(snowfall)) {
      skipped.noSnowfall += 1;
      continue;
    }
    const obs = obsByKey.get(`${row.resort}|${row.validDate}`);
    const observed = obs?.newSnowIn == null ? null : Number(obs.newSnowIn);
    if (observed == null || !Number.isFinite(observed)) {
      skipped.noObservation += 1;
      continue;
    }
    const key = `${bucket}|${row.source}|${row.model}`;
    if (!groups.has(key)) {
      groups.set(key, {
        bucket,
        source: row.source,
        model: row.model,
        ...emptyStats(),
      });
    }
    const stats = groups.get(key);
    const signed = snowfall - observed;
    stats.n += 1;
    stats.absError += Math.abs(signed);
    stats.signedError += signed;
    const forecastStorm = snowfall >= stormInches;
    const observedStorm = observed >= stormInches;
    if (forecastStorm && observedStorm) stats.hits += 1;
    else if (!forecastStorm && observedStorm) stats.misses += 1;
    else if (forecastStorm && !observedStorm) stats.falseAlarms += 1;
    else stats.quiet += 1;
  }

  const buckets = {};
  for (const bucket of LEAD_BUCKETS) {
    const models = [...groups.values()]
      .filter((stats) => stats.bucket === bucket.id && stats.n > 0)
      .map((stats) => {
        const hitDenom = stats.hits + stats.misses;
        return {
          source: stats.source,
          model: stats.model,
          n: stats.n,
          mae: round3(stats.absError / stats.n),
          bias: round3(stats.signedError / stats.n),
          hits: stats.hits,
          misses: stats.misses,
          falseAlarms: stats.falseAlarms,
          quiet: stats.quiet,
          hitRate: hitDenom ? round3(stats.hits / hitDenom) : null,
        };
      })
      .sort(compareModels)
      .map((model, index) => ({ ...model, rank: index + 1 }));
    buckets[bucket.id] = { models };
  }

  const scorecard = {
    generatedAt: new Date().toISOString(),
    season: FORECAST_ACCURACY_SEASON,
    stormThresholdIn: stormInches,
    pairCount: [...groups.values()].reduce((sum, stats) => sum + stats.n, 0),
    buckets,
    skipped,
  };
  scorecard.headline = buildHeadline(scorecard);
  return scorecard;
}

function compareModels(a, b) {
  if (a.mae !== b.mae) return a.mae - b.mae;
  const aRate = a.hitRate ?? -1;
  const bRate = b.hitRate ?? -1;
  if (aRate !== bRate) return bRate - aRate;
  const aBias = Math.abs(a.bias ?? 0);
  const bBias = Math.abs(b.bias ?? 0);
  if (aBias !== bBias) return aBias - bBias;
  const name = `${a.source}:${a.model}`.localeCompare(`${b.source}:${b.model}`);
  return name;
}

export function buildHeadline(scorecard) {
  const parts = [];
  let any = false;
  for (const bucket of LEAD_BUCKETS) {
    const top = scorecard.buckets[bucket.id]?.models?.[0];
    if (!top) {
      parts.push(`${bucket.id}d no pairs`);
      continue;
    }
    any = true;
    parts.push(
      `${bucket.id}d leader ${top.model} MAE ${top.mae.toFixed(2)} in (n=${top.n})`
    );
  }
  if (!any) {
    return "No overlapping forecast/observation pairs in lead buckets 1-3, 4-7, or 8-16.";
  }
  return `${parts.join("; ")}.`;
}
