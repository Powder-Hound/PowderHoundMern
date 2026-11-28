/**
 * Offline snow-to-liquid backtest. Not a forecast score and not for publication.
 *
 * (a) Ratio only. No forecast provider is called. For each SNOTEL station in
 *     stations.json, daily new snow is predicted as observed SWE increase
 *     times a ratio, and compared with the observed snow-depth increase.
 *     Depth change undercounts new snow because the pack settles.
 * (b) The same ratios on days that also appear in the internal capture,
 *     beside the stored PowAlert snow number. The capture is thin.
 *
 * Visual Crossing is not called. NWS is not called. SNOTEL comes from the
 * public NRCS AWDB REST API, which does not use a key.
 *
 *   node scripts/backtest-slr/backtest.js --capture /path/to/powalert-accuracy
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { snowFromLiquid } from "../../utils/snowRatio.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const AWDB = "https://wcc.sc.egov.usda.gov/awdbRestApi/services/v1/data";
const USER_AGENT = "PowAlert slr-backtest (forecast@powalert.com)";
const FIXED_RATIO = 10;

const SEASONS = [
  ["2023-11-01", "2024-04-30"],
  ["2024-11-01", "2025-04-30"],
  ["2025-11-01", "2026-04-30"],
  ["2026-11-01", "2026-11-27"],
];

const REGION_ORDER = [
  "Wasatch",
  "Colorado",
  "Sierra",
  "Tetons",
  "Northern Rockies",
  "Cascades",
  "Northeast",
];

function arg(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1] || null;
}

function addDays(dateKey, delta) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day + delta));
  return utc.toISOString().slice(0, 10);
}

function inSeason(dateKey) {
  return SEASONS.some(([begin, end]) => dateKey >= begin && dateKey <= end);
}

function toInches(value, unit) {
  if (value == null || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const name = String(unit || "in").toLowerCase();
  if (name === "mm") return number / 25.4;
  if (name === "cm") return number / 2.54;
  return number;
}

function toFahrenheit(value, unit) {
  if (value == null || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const name = String(unit || "degf").toLowerCase();
  if (name.includes("c") && !name.includes("f")) return (number * 9) / 5 + 32;
  return number;
}

function observedTempF(row) {
  if (row.TMAX != null && row.TMIN != null) return (row.TMAX + row.TMIN) / 2;
  if (row.TOBS != null) return row.TOBS;
  return null;
}

async function fetchAwdb(triplets, begin, end) {
  const url = new URL(AWDB);
  url.searchParams.set("stationTriplets", triplets.join(","));
  url.searchParams.set("elements", "SNWD,WTEQ,TMAX,TMIN,TOBS");
  url.searchParams.set("duration", "DAILY");
  url.searchParams.set("beginDate", begin);
  url.searchParams.set("endDate", end);
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(120000),
  });
  if (!response.ok) {
    throw new Error(`AWDB HTTP ${response.status} for ${begin}..${end}`);
  }
  return response.json();
}

function indexPayload(payload, into) {
  for (const station of payload || []) {
    const triplet = station.stationTriplet;
    if (!triplet) continue;
    for (const element of station.data || []) {
      const code = element.stationElement?.elementCode;
      const unit = element.stationElement?.storedUnitCode || "";
      if (!code) continue;
      for (const value of element.values || []) {
        const date = String(value.date || "").slice(0, 10);
        if (!date) continue;
        const key = `${triplet}|${date}`;
        const row = into.get(key) || { triplet, date };
        if (code === "SNWD" || code === "WTEQ") row[code] = toInches(value.value, unit);
        else row[code] = toFahrenheit(value.value, unit);
        into.set(key, row);
      }
    }
  }
}

function metrics(pairs) {
  const n = pairs.length;
  if (!n) return { n: 0, mae: null, bias: null };
  let abs = 0;
  let bias = 0;
  for (const [pred, actual] of pairs) {
    abs += Math.abs(pred - actual);
    bias += pred - actual;
  }
  return { n, mae: abs / n, bias: bias / n };
}

function fmt(value) {
  return value == null || !Number.isFinite(value) ? "—" : value.toFixed(2);
}

function rowLine(label, stations, pairs) {
  const slr = metrics(pairs.map((pair) => [pair.slr, pair.actual]));
  const fixed = metrics(pairs.map((pair) => [pair.fixed, pair.actual]));
  return `| ${label} | ${stations} | ${slr.n} | ${fmt(slr.mae)} | ${fmt(slr.bias)} | ${fmt(fixed.mae)} | ${fmt(fixed.bias)} |`;
}

function groupLines(samples, stations, { weak }) {
  const lines = [
    "| region | stations | n | Kuchera MAE in | Kuchera bias in | 10:1 MAE in | 10:1 bias in |",
    "|---|---:|---:|---:|---:|---:|---:|",
  ];
  const usable = stations.filter((station) => (weak === "exclude" ? station.match !== "weak" : true));
  for (const region of REGION_ORDER) {
    const inRegion = usable.filter((station) => station.region === region);
    const triplets = new Set(inRegion.map((station) => station.triplet));
    const pairs = samples.filter((sample) => triplets.has(sample.triplet));
    if (!inRegion.length) continue;
    lines.push(rowLine(region, inRegion.length, pairs));
  }
  const allowed = new Set(usable.map((station) => station.triplet));
  lines.push(rowLine("All", usable.length, samples.filter((sample) => allowed.has(sample.triplet))));
  return lines;
}

async function loadObservations(stations) {
  const rows = new Map();
  const triplets = stations.map((station) => station.triplet);
  for (const [begin, end] of SEASONS) {
    const payload = await fetchAwdb(triplets, addDays(begin, -1), end);
    indexPayload(payload, rows);
    process.stderr.write(`AWDB ${begin}..${end} rows=${rows.size}\n`);
  }
  return rows;
}

function ratioSamples(stations, rows) {
  const samples = [];
  const skipped = [];
  for (const station of stations) {
    let depthDays = 0;
    const dates = [...rows.values()]
      .filter((row) => row.triplet === station.triplet)
      .map((row) => row.date)
      .sort();
    for (const date of dates) {
      if (!inSeason(date)) continue;
      const today = rows.get(`${station.triplet}|${date}`);
      const prev = rows.get(`${station.triplet}|${addDays(date, -1)}`);
      if (!today || !prev) continue;
      if (today.SNWD == null || prev.SNWD == null || today.WTEQ == null || prev.WTEQ == null) {
        continue;
      }
      const temp = observedTempF(today);
      if (temp == null) continue;
      depthDays += 1;
      const swe = Math.max(0, today.WTEQ - prev.WTEQ);
      const actual = Math.max(0, today.SNWD - prev.SNWD);
      const slr = snowFromLiquid(swe, temp);
      if (slr == null) continue;
      samples.push({
        triplet: station.triplet,
        region: station.region,
        match: station.match,
        date,
        swe,
        actual,
        slr,
        fixed: swe * FIXED_RATIO,
      });
    }
    if (depthDays === 0) {
      skipped.push(`${station.triplet} (${station.resorts.join(", ")}): no depth+SWE+temperature days`);
    }
  }
  return { samples, skipped };
}

function capturePairs(captureDir, stations, rows) {
  const dbPath = join(captureDir, "data", "accuracy.sqlite");
  const db = new DatabaseSync(dbPath, { readOnly: true });
  const pairs = db
    .prepare(
      `SELECT f.resort, f.lead_days, f.target_date, f.forecast_snow_in,
              a.actual_snow_in, a.station
       FROM forecasts f
       JOIN actuals a ON a.resort = f.resort AND a.date = f.target_date AND a.source = 'snotel'
       WHERE f.source = 'powalert'
         AND f.forecast_snow_in IS NOT NULL
         AND a.actual_snow_in IS NOT NULL`
    )
    .all();
  const byTriplet = new Map(stations.map((station) => [station.triplet, station]));
  const scored = [];
  for (const pair of pairs) {
    const station = byTriplet.get(pair.station);
    const today = db
      .prepare("SELECT wteq_in FROM snotel_daily WHERE triplet = ? AND date = ?")
      .get(pair.station, pair.target_date);
    const prev = db
      .prepare("SELECT wteq_in FROM snotel_daily WHERE triplet = ? AND date = ?")
      .get(pair.station, addDays(pair.target_date, -1));
    const swe =
      today?.wteq_in == null || prev?.wteq_in == null
        ? null
        : Math.max(0, today.wteq_in - prev.wteq_in);
    const awdb = rows.get(`${pair.station}|${pair.target_date}`);
    const temp = awdb ? observedTempF(awdb) : null;
    const slr = swe == null || temp == null ? null : snowFromLiquid(swe, temp);
    scored.push({
      resort: pair.resort,
      lead: pair.lead_days,
      date: pair.target_date,
      region: station?.region || "unknown",
      actual: pair.actual_snow_in,
      powalert: pair.forecast_snow_in,
      fixed: swe == null ? null : swe * FIXED_RATIO,
      slr,
    });
  }
  db.close();
  return scored;
}

function uniqueDays(scored) {
  const byDay = new Map();
  for (const row of scored) {
    const key = `${row.resort}|${row.date}`;
    const existing = byDay.get(key);
    if (!existing || row.lead < existing.lead) byDay.set(key, row);
  }
  return [...byDay.values()];
}

function captureTable(scored, days) {
  const lines = [
    "| method | scored as | n | n with observed depth > 0 | MAE in | bias in |",
    "|---|---|---:|---:|---:|---:|",
  ];
  const blocks = [
    ["PowAlert stored snow", "forecast/actual pairs, every lead", scored, (row) => row.powalert],
    ["Fixed 10:1 × observed SWE increase", "unique resort-days", days, (row) => row.fixed],
    ["Kuchera SLR × observed SWE increase", "unique resort-days", days, (row) => row.slr],
  ];
  for (const [label, how, source, pick] of blocks) {
    const usable = source.filter((row) => pick(row) != null);
    const stat = metrics(usable.map((row) => [pick(row), row.actual]));
    const wet = usable.filter((row) => row.actual > 0).length;
    lines.push(`| ${label} | ${how} | ${stat.n} | ${wet} | ${fmt(stat.mae)} | ${fmt(stat.bias)} |`);
  }
  return lines;
}

async function main() {
  const stations = JSON.parse(readFileSync(join(HERE, "stations.json"), "utf8")).stations;
  const capture = arg("--capture");
  const rows = await loadObservations(stations);
  const { samples, skipped } = ratioSamples(stations, rows);
  const snowDays = samples.filter((sample) => sample.swe > 0);
  const lines = [];
  lines.push("# SLR backtest (internal diagnostic, not an accuracy claim)");
  lines.push("");
  lines.push(
    "Predicted new snow is observed SWE increase times a ratio. The comparison is the clipped snow-depth increase at the same station. Depth change undercounts new snow because the pack settles and compacts during the storm, so a positive bias is expected even when the ratio is fair. Dry days (no SWE increase) make both predictions 0 and pull MAE down."
  );
  lines.push("");
  lines.push("## (a) Days with SWE increase > 0, all stations");
  lines.push("");
  lines.push(...groupLines(snowDays, stations, { weak: "include" }));
  lines.push("");
  lines.push("## (a) Days with SWE increase > 0, excluding weak station matches");
  lines.push("");
  lines.push(...groupLines(snowDays, stations, { weak: "exclude" }));
  lines.push("");
  lines.push("## (a) All paired days, including dry days");
  lines.push("");
  lines.push(...groupLines(samples, stations, { weak: "include" }));
  lines.push("");
  if (skipped.length) {
    lines.push("Stations with no scorable depth days: " + skipped.join("; ") + ".");
    lines.push("");
  }
  lines.push(
    `Ratio-only days: ${samples.length}. Days with SWE increase > 0: ${snowDays.length}. Temperature is the daily mean of TMAX and TMIN when both exist, otherwise TOBS. Seasons are 2023-11-01..2024-04-30, 2024-11-01..2025-04-30, 2025-11-01..2026-04-30, and 2026-11-01..2026-11-27.`
  );
  lines.push("");
  if (!capture) {
    lines.push("## (b) Capture");
    lines.push("");
    lines.push("No `--capture` path was passed, so the overlap table was not built.");
  } else {
    const scored = capturePairs(capture, stations, rows);
    const days = uniqueDays(scored);
    const dry = scored.filter((row) => row.actual === 0).length;
    const leads = [...new Set(scored.map((row) => row.lead))].sort((a, b) => a - b);
    lines.push("## (b) Overlap with the internal capture");
    lines.push("");
    lines.push(
      `${scored.length} PowAlert forecast/actual pairs (leads ${leads.join(", ") || "none"}), on ${days.length} resort-days. ${dry} pairs have observed depth change of 0. A resort-day can have more than one lead, so the ratio rows are scored once per resort-day. This sample is too small, and too dry, to decide whether powalert-slr should enter the published blend.`
    );
    lines.push("");
    lines.push(...captureTable(scored, days));
    lines.push("");
    const byRegion = new Map();
    for (const row of days) {
      const list = byRegion.get(row.region) || [];
      list.push(row);
      byRegion.set(row.region, list);
    }
    lines.push(
      "Regional rows are unique resort-days. Where a day was issued at more than one lead, the PowAlert column uses the shorter lead."
    );
    lines.push("");
    lines.push("| region | resort-days | dry | PowAlert MAE | Kuchera MAE | 10:1 MAE |");
    lines.push("|---|---:|---:|---:|---:|---:|");
    for (const region of [...REGION_ORDER, "unknown"]) {
      const list = byRegion.get(region);
      if (!list?.length) continue;
      const pow = metrics(list.map((row) => [row.powalert, row.actual]));
      const slrRows = list.filter((row) => row.slr != null);
      const fixedRows = list.filter((row) => row.fixed != null);
      const slr = metrics(slrRows.map((row) => [row.slr, row.actual]));
      const fixed = metrics(fixedRows.map((row) => [row.fixed, row.actual]));
      const dryRegion = list.filter((row) => row.actual === 0).length;
      lines.push(
        `| ${region} | ${list.length} | ${dryRegion} | ${fmt(pow.mae)} | ${fmt(slr.mae)} | ${fmt(fixed.mae)} |`
      );
    }
  }
  lines.push("");
  process.stdout.write(lines.join("\n"));
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
