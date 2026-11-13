/**
 * Numeric constants for the resort-management simulation.
 *
 * Every value the day-resolver branches on is registered here with provenance
 * from game/data/economics-sources.json (59 sourced or derived anchors, 20
 * unsourced gaps). The day-resolver does not keep its own copies.
 *
 * Caveat from the source pack: NSAA's Economic Analysis is paywalled, so
 * national revenue and operating cost per visit are NOT the NSAA figures.
 * The anchors in use are Vail FY26 mountain net revenue ($163.62) and
 * mountain opex ($116) per visit, plus NSAA's $75 ticket yield. Costs are
 * mostly fixed. Season passes are 49% of visits and day tickets about 31%,
 * so posted-price elasticity applies to the day-ticket segment.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const raw = JSON.parse(
  readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "data", "economics-sources.json"),
    "utf8"
  )
);

export const economicsSourcePack = raw;

const anchors = new Map(raw.anchors.map((row) => [row.id, row]));
const gaps = new Map(raw.unsourced.map((row) => [row.id, row]));

const used = [];
const referenceOnly = [];

function anchorMeta(id) {
  const row = anchors.get(id);
  if (!row) throw new Error(`Missing economics anchor: ${id}`);
  return {
    source_id: row.source,
    url: row.url,
    year: row.year,
    confidence: row.confidence,
    unit: row.unit,
    metric: row.metric,
    parent_id: id,
  };
}

function pushUsed(entry) {
  used.push(entry);
  return entry.value;
}

function usePart(parentId, part, value, note) {
  return pushUsed({
    id: `${parentId}.${part}`,
    status: anchors.get(parentId).status,
    ...anchorMeta(parentId),
    value,
    note,
    placeholder_range: null,
  });
}

function useGap(id, value, note) {
  const gap = gaps.get(id);
  if (!gap) throw new Error(`Missing unsourced gap: ${id}`);
  return pushUsed({
    id,
    status: "UNSOURCED",
    source_id: null,
    url: null,
    year: null,
    confidence: "none",
    unit: gap.unit,
    metric: gap.metric,
    value,
    note,
    placeholder_range: gap.proposed_placeholder_range,
    reason: gap.reason,
    closest_sourced_proxy: gap.closest_sourced_proxy,
  });
}

function useExtraGap(id, value, { unit, metric, placeholder_range, note, closest_sourced_proxy }) {
  return pushUsed({
    id,
    status: "UNSOURCED",
    source_id: null,
    url: null,
    year: null,
    confidence: "none",
    unit,
    metric,
    value,
    note,
    placeholder_range,
    reason: note,
    closest_sourced_proxy: closest_sourced_proxy ?? null,
  });
}

function useDesign(id, value, note, unit) {
  return pushUsed({
    id,
    status: "DESIGN_DOC",
    source_id: "design-v3",
    url: null,
    year: "2026-11-13",
    confidence: "design",
    unit: unit ?? null,
    metric: id,
    value,
    note,
    placeholder_range: null,
  });
}

function useUnit(id, value, unit, note) {
  return pushUsed({
    id,
    status: "UNIT",
    source_id: null,
    url: null,
    year: null,
    confidence: "definition",
    unit,
    metric: id,
    value,
    note,
    placeholder_range: null,
  });
}

function useDerived(id, value, parentId, note, unit) {
  return pushUsed({
    id,
    status: "DERIVED_FROM_SOURCED",
    ...anchorMeta(parentId),
    unit: unit ?? anchorMeta(parentId).unit,
    value,
    note,
    placeholder_range: null,
  });
}

function rememberReference(parentId, part, value, note) {
  referenceOnly.push({
    id: part ? `${parentId}.${part}` : parentId,
    status: anchors.get(parentId).status,
    ...anchorMeta(parentId),
    value,
    note,
    used_in_day_equation: false,
  });
  return value;
}

export function firstNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const match = String(value)
    .replace(/,/g, "")
    .match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function percent(value) {
  const n = firstNumber(value);
  if (n == null) throw new Error(`Cannot parse percent from ${value}`);
  return n / useUnit._scale;
}

// Percent scale is a unit. Registered below; percent() reads it after init
// via the binding. The literal 100 lives only on the UNIT row.
const percentScale = useUnit(
  "percent_scale",
  100,
  "percent",
  "Converts a source figure written as 49% into a 0-1 share."
);
useUnit._scale = percentScale;

function shareOf(parentId, part, rawValue, note) {
  return usePart(parentId, part, percent(rawValue), note);
}

const midpointDivisor = useUnit(
  "midpoint_divisor",
  2,
  "count",
  "Arithmetic midpoint of a published low-high placeholder range."
);

function mid(low, high) {
  return (low + high) / midpointDivisor;
}

const centsPerDollar = useUnit("cents_per_dollar", 100, "cents", "Money is reported to the cent.");
const cmPerInch = useUnit("cm_per_inch", 2.54, "cm", "Inch to centimetre.");
const cmPerFoot = useUnit("cm_per_foot", 30.48, "cm", "Foot to centimetre. One acre-foot spread over one acre is one foot of snow.");
const mmPerCm = useUnit("mm_per_cm", 10, "mm", "Millimetre to centimetre.");
const kmPerMile = useUnit("km_per_mile", 1.609344, "km", "Statute mile to kilometre.");
const fahrenheitScale = useUnit("fahrenheit_scale", 1.8, "deg", "C to F scale (9/5).");
const fahrenheitOffset = useUnit("fahrenheit_offset", 32, "deg F", "C to F offset.");
const freezingC = useUnit("freezing_c", 0, "deg C", "Freezing point of water, used as the melt and rain threshold.");
const log2Base = useUnit("log2_base", 2, "ratio", "Base of the marketing doubling curve.");
const csatToHundred = useUnit(
  "csat_to_hundred_scale",
  10,
  "points",
  "Kottke overall satisfaction is 0-10. The API reports 0-100, so scores are multiplied by 10."
);
const million = useUnit("million", 1000000, "count", "Source visit totals are quoted in millions.");

const schemaVersion = useDesign(
  "schema_version",
  1,
  "Increment 1 state schema. Persisted on each game so a later increment can migrate.",
  "version"
);
const primeWeeks = useDesign(
  "prime_weeks",
  12,
  "Design doc section 5: each resort gets 12 prime weeks a season and then closes.",
  "weeks"
);
const daysPerWeek = useUnit("days_per_week", 7, "days", "Calendar week.");
const satisfactionMin = useDesign(
  "satisfaction_min",
  0,
  "Increment 1 contract: guest satisfaction is reported on 0-100.",
  "points"
);
const satisfactionMax = useDesign(
  "satisfaction_max",
  100,
  "Increment 1 contract: guest satisfaction is reported on 0-100.",
  "points"
);
const decisionPriceFloor = useDesign(
  "decision_price_floor",
  0,
  "Posted price may be zero so the stress harness can run a free-ticket day. Zero is not a sourced window price.",
  "USD"
);
const forecastHorizonDays = useDesign(
  "forecast_horizon_days",
  7,
  "How many forecast days the turn response includes so the client can plan snowmaking. Not an economic parameter.",
  "days"
);
const oneBigBetPerDay = useDesign(
  "big_bets_per_day",
  1,
  "Design section 1: an occasional big bet, at most one in a day's decisions.",
  "count"
);

const visitsUsMillion = usePart(
  "visits_us_2526",
  "visits_million",
  anchors.get("visits_us_2526").value,
  "Final 2025-26 U.S. snowsports visits, millions."
);
const areasOperating = usePart(
  "areas_operating",
  "2024_25",
  anchors.get("areas_operating").value["2024-25"],
  "Operating U.S. ski areas, 2024-25."
);
const seasonLengthDays = usePart(
  "season_length",
  "2025_26",
  firstNumber(anchors.get("season_length").value["2025-26"]),
  "Average operating season, days. Source text is '~110 (flat vs prior)'."
);
const smallVisitShare = shareOf(
  "visits_by_size",
  "small_visit_share",
  anchors.get("visits_by_size").value["small areas share of visits"],
  "Small areas' share of U.S. visits, 2023-24."
);
const smallAreaShare = shareOf(
  "visits_by_size",
  "small_area_share",
  anchors.get("visits_by_size").value["small areas share of areas"],
  "Small areas' share of U.S. ski areas, 2023-24."
);
const xlVisitShare = shareOf(
  "visits_by_size",
  "xl_visit_share",
  anchors.get("visits_by_size").value["extra-large share of visits"],
  "Extra-large resorts' share of visits. Used as context for capacity; area counts for XL are not public."
);

const passVisitShare = shareOf(
  "access_mix",
  "pass",
  anchors.get("access_mix").value["season pass"],
  "Season-pass share of visits. This segment does not respond to the posted day-ticket price."
);
const dayVisitShare = shareOf(
  "access_mix",
  "day_ticket",
  anchors.get("access_mix").value["day/multi-day tickets"],
  "Day and multi-day ticket share of visits. Posted-price elasticity applies here."
);
const otherVisitShare = shareOf(
  "access_mix",
  "other",
  anchors.get("access_mix").value["other (frequency, employee, comp)"],
  "Frequency, employee, and comp share of visits."
);

const liftRevenueShare = shareOf(
  "rev_split_vail",
  "lift",
  anchors.get("rev_split_vail").value.lift,
  "Lift share of Vail mountain net revenue, FY2026."
);
const skiSchoolRevenueShare = shareOf(
  "rev_split_vail",
  "ski_school",
  anchors.get("rev_split_vail").value["ski school"],
  "Ski school share of Vail mountain net revenue, FY2026."
);
const diningRevenueShare = shareOf(
  "rev_split_vail",
  "dining",
  anchors.get("rev_split_vail").value.dining,
  "Dining share of Vail mountain net revenue, FY2026."
);
const retailRevenueShare = shareOf(
  "rev_split_vail",
  "retail_rental",
  anchors.get("rev_split_vail").value["retail/rental"],
  "Retail and rental share of Vail mountain net revenue, FY2026."
);
const otherRevenueShare = shareOf(
  "rev_split_vail",
  "other",
  anchors.get("rev_split_vail").value.other,
  "Other mountain revenue share, Vail FY2026."
);

const ticketYield = usePart(
  "ticket_yield_2425",
  "usd",
  anchors.get("ticket_yield_2425").value,
  "NSAA average ticket yield: all ticket plus pass revenue divided by visits."
);
const vailRevenuePerVisit = usePart(
  "rev_per_visit_vail",
  "fy2026",
  anchors.get("rev_per_visit_vail").value.FY2026,
  "Vail mountain net revenue per skier visit, FY2026. Big-resort proxy because NSAA total revenue per visit is paywalled."
);
const vailOpexPerVisit = usePart(
  "opex_per_visit_vail",
  "fy2026",
  anchors.get("opex_per_visit_vail").value.FY2026,
  "Vail mountain operating expense per skier visit, FY2026."
);
const laborShareOfOpex = shareOf(
  "labor_share_vail",
  "share_of_opex",
  anchors.get("labor_share_vail").value["share of opex"],
  "Labor and labor-related benefits as a share of Vail mountain opex, FY2026."
);

const vailOpexChange = useDerived(
  "vail_fy26_opex_change",
  -0.021,
  "opex_per_visit_vail",
  "Opex fell 2.1% in FY26 while visits fell 13.4%. Taken from the opex_per_visit_vail confidence note. Not used as the daily fixed share; the unsourced 70-80% fixed range is. Recorded so the divergence stays next to the placeholder.",
  "share"
);
const vailVisitChange = usePart(
  "snow_visits_vail",
  "visit_change",
  -0.134,
  "Vail FY26 visitation down 13.4% (15.299M vs 17.665M)."
);
rememberReference(
  "price_elasticity_lr",
  null,
  anchors.get("price_elasticity_lr").value,
  "Long-run season-level price elasticity (-0.40, France). Not used for the daily walk-up response. The day-ticket curve uses the unsourced short-run range."
);
rememberReference(
  "powder_day_effect",
  "11_20cm",
  0.545,
  "La Grave off-piste next-day uplift. Upper bound only. U.S. alpine days use the unsourced powder_uplift_alpine range."
);
rememberReference(
  "powder_day_effect",
  "21cm_plus",
  1.215,
  "La Grave off-piste next-day uplift for 21 cm or more. Not applied directly."
);
rememberReference(
  "snowmaking_cost_af",
  "after",
  anchors.get("snowmaking_cost_af").value["after automation/upgrades"],
  "Aspen 2009-10 energy plus labor per acre-foot after upgrades. Superseded in the day equation by the unsourced all-in 2026 range."
);

const scottPnwRevenue = usePart(
  "rev_per_visit_region_scott",
  "pacific_northwest",
  firstNumber(anchors.get("rev_per_visit_region_scott").value["Pacific Northwest"]),
  "Scott and Steiger regional winter revenue per visit, Pacific Northwest, about $65."
);
const scottRockiesRevenue = usePart(
  "rev_per_visit_region_scott",
  "pacific_southwest_rockies",
  firstNumber(anchors.get("rev_per_visit_region_scott").value["Pacific Southwest / Rockies"]),
  "Scott and Steiger regional winter revenue per visit, Pacific Southwest and Rockies, about $113. Index base for regional revenue."
);
const ncRevenuePerVisit = usePart(
  "rev_per_visit_nc",
  "2022_23",
  anchors.get("rev_per_visit_nc").value["2022-23"],
  "North Carolina gross ski-area revenue per visit. Southeast index only."
);

const weekdayWeight = usePart(
  "demand_weights",
  "weekday",
  anchors.get("demand_weights").value.weekday,
  "Relative daily visits, weekday, Ontario OSRA weights."
);
const weekendWeight = usePart(
  "demand_weights",
  "weekend",
  anchors.get("demand_weights").value.weekend,
  "Relative daily visits, weekend."
);
const holidayWeight = usePart(
  "demand_weights",
  "holiday",
  anchors.get("demand_weights").value["holiday period"],
  "Relative daily visits, holiday period."
);

const tempPenalty15 = shareOf(
  "temp_demand",
  "below_m15c",
  anchors.get("temp_demand").value["< -15C"],
  "Visit reduction when daily temperature is below -15C. Stored as a positive share (0.05 means -5%)."
);
const tempPenalty20 = shareOf(
  "temp_demand",
  "below_m20c",
  anchors.get("temp_demand").value["< -20C"],
  "Visit reduction below -20C."
);
const tempPenalty25 = shareOf(
  "temp_demand",
  "below_m25c",
  anchors.get("temp_demand").value["< -25C"],
  "Visit reduction below -25C."
);
const tempPenaltyHot = shareOf(
  "temp_demand",
  "above_p15c",
  anchors.get("temp_demand").value["> +15C"],
  "Visit reduction above +15C."
);
const tempThreshold15 = useExtraGap(
  "temp_threshold_c",
  { cold15: -15, cold20: -20, cold25: -25, hot15: 15 },
  {
    unit: "deg C",
    metric: "Temperature thresholds paired with temp_demand",
    placeholder_range: "thresholds are the labels of the sourced temp_demand rows",
    note: "The sourced visit penalties are attached to these exact thresholds. They are the row labels of temp_demand, not a separate estimate.",
    closest_sourced_proxy: "temp_demand",
  }
);

const openDepthCm = usePart(
  "open_depth",
  "cm",
  anchors.get("open_depth").value,
  "Minimum snow depth for ski operations, Ontario SkiSim2.0."
);

const utilizationAnnualLow = shareOf(
  "utilization",
  "annual_low",
  "10%",
  "Low end of market-wide annual lift-capacity utilization (10-13%)."
);
const utilizationAnnualHigh = shareOf(
  "utilization",
  "annual_high",
  "13%",
  "High end of market-wide annual lift-capacity utilization (10-13%)."
);
const utilizationAt15MinWait = shareOf(
  "utilization",
  "seasonal_at_15_min_wait",
  "25%",
  "Seasonal utilization at which the Ontario model reports about a 15 minute average lift wait. Treated as comfortable daily capacity."
);

const groomingCostPerHour = usePart(
  "grooming_cost_hr",
  "usd_per_hour",
  anchors.get("grooming_cost_hr").value,
  "All-in cost of running a large snowcat."
);
const capexPerVisit = usePart(
  "capex_per_visit",
  "2025_26",
  anchors.get("capex_per_visit").value["2025-26"],
  "NSAA capital reinvestment per skier visit, 2025-26. Compared with big-bet cost; not charged as a daily cost."
);

const csatOverall = usePart(
  "csat_national",
  "overall",
  anchors.get("csat_national").value.overall,
  "National overall visit satisfaction, 0-10 scale."
);
const csatValueForPrice = usePart(
  "csat_national",
  "value_for_price",
  anchors.get("csat_national").value["value for price paid"],
  "National value-for-price satisfaction. The gap versus overall scales the posted-price satisfaction penalty."
);

const parkSnowmakingShareLow = shareOf(
  "park_snowmaking_share",
  "low",
  "25%",
  "Low end of pipes-and-parks share of snowmaking resources."
);
const parkSnowmakingShareHigh = shareOf(
  "park_snowmaking_share",
  "high",
  "35%",
  "High end of pipes-and-parks share of snowmaking resources."
);

// --- Unsourced placeholders. `value` is the midpoint unless the note says otherwise. ---

const smallRevenueLow = 60;
const smallRevenueHigh = 90;
const mediumRevenueLow = 70;
const mediumRevenueHigh = 100;
const largeRevenueLow = 100;
const largeRevenueHigh = 140;

const revenueBySize = useGap(
  "rev_by_size_region_current",
  {
    small: mid(smallRevenueLow, smallRevenueHigh),
    medium: mid(mediumRevenueLow, mediumRevenueHigh),
    large: mid(largeRevenueLow, largeRevenueHigh),
    "extra-large": vailRevenuePerVisit,
  },
  "Midpoints of the placeholder bands. Extra-large uses the sourced Vail FY26 figure ($163.62), which sits inside the 140-180 band, instead of the band midpoint."
);

const nationalRevenueLow = 140;
const nationalRevenueHigh = 165;
const nationalRevenuePerVisit = useGap(
  "nsaa_rev_per_visit_total",
  mid(nationalRevenueLow, nationalRevenueHigh),
  "Midpoint of the 140-165 placeholder. Scale reference for pass yield. Not the NSAA Economic Analysis figure."
);

const opexBySize = useGap(
  "nsaa_opex_per_visit",
  {
    small: mid(60, 80),
    medium: 80,
    large: mid(100, 125),
    "extra-large": vailOpexPerVisit,
  },
  "Small uses the 60-80 midpoint ($70). The pack states no medium figure. Medium uses $80, the top of the stated small band, so it stays inside a published endpoint. An 80-100 interpolation ($90) would sit above the medium revenue midpoint ($85) and lose money on every visit before weather. Large uses the 100-125 midpoint ($112.50). Extra-large uses sourced Vail FY26 opex ($116), inside that band."
);

const fixedShare = useGap(
  "fixed_vs_variable",
  mid(0.7, 0.8),
  "Fixed share of opex, midpoint of ~70-80%. The variable complement is 1 minus this. Vail FY26 opex -2.1% against visits -13.4% implies about 16% variable, which is outside this placeholder, so the day model uses the placeholder midpoint. The variable slice is assigned to staffing first; remaining labor is a seasonal guarantee paid every operating day."
);

const snowmakingCostPerAf = useGap(
  "snowmaking_all_in_af_current",
  mid(1000, 2500),
  "All-in snowmaking cost per acre-foot, midpoint of $1,000-2,500. This is what a snowmaking budget buys. The 2010 Aspen energy-plus-labor figure is reference only."
);
const baseAcreFeetLow = 1.5;
const baseAcreFeetHigh = 2.0;
const openingBaseAcreFeet = useGap(
  "snowmaking_depth_per_acre",
  mid(baseAcreFeetLow, baseAcreFeetHigh),
  "Acre-feet of machine snow per acre for an 18-24 inch base. Midpoint. The daily budget cap is high-end acre-feet times high-end cost, so one cold night can attempt a full base."
);
const goodCoverInchesLow = 18;
const goodCoverInchesHigh = 24;
const goodCoverInches = useExtraGap("good_cover_inches", mid(goodCoverInchesLow, goodCoverInchesHigh), {
  unit: "inches of base",
  metric: "Good snow cover, from the snowmaking_depth_per_acre placeholder",
  placeholder_range: "18-24 inches",
  note: "The snowmaking_depth_per_acre gap states an 18-24 inch base. This is that band's midpoint in inches. No thin-cover penalty at or above it. The hard open threshold remains the sourced 30 cm.",
  closest_sourced_proxy: "snowmaking_depth_per_acre",
});

const snowmakingShutoffF = useGap(
  "snowmaking_temp_window",
  { shutoffAboveF: 28, efficientAtOrBelowF: 20, marginalLowF: 24, marginalHighF: 28 },
  "Placeholder window: no production above 28F wet bulb, efficient at or below 20F, marginal from 24F to 28F."
);
const snowmakingMarginalYield = useExtraGap(
  "snowmaking_marginal_yield",
  mid(0.25, 0.75),
  {
    unit: "share of efficient production",
    metric: "Yield inside the marginal wet-bulb band",
    placeholder_range: "0.25-0.75 of efficient yield between 24F and 28F; the pack gives the band but no rate",
    note: "Not a separate pack row. The temp-window gap says production is marginal from 24F to 28F and gives no rate. Midpoint yield at 24F, falling to zero at 28F.",
    closest_sourced_proxy: "snowmaking_temp_window",
  }
);
const snowmakingLagDays = useExtraGap("snowmaking_production_lag_days", 1, {
  unit: "days",
  metric: "Delay before made snow is skiable depth",
  placeholder_range: "1-2 days",
  note: "Not a pack row. Design section 1 requires a production lag so snow made tonight is not depth this morning. Used value is the bottom of 1-2 days.",
  closest_sourced_proxy: "snowmaking_temp_window",
});

const groomingAcresPerHour = useGap(
  "grooming_acres_per_hour",
  mid(20, 50),
  "Snowcat productivity, midpoint of 20-50 acres per hour. Combined with the sourced $150 per groomer-hour."
);
const groomingPartialFraction = useExtraGap("grooming_partial_fraction", mid(0.4, 0.6), {
  unit: "share of open acres",
  metric: "Partial grooming schedule",
  placeholder_range: "0.4-0.6 of open acres",
  note: "Schedules are none / partial / full. Full is 1 and none is 0. Partial is the midpoint of 0.4-0.6. Not a pack row; the pack has no schedule names.",
  closest_sourced_proxy: "grooming_cost_per_acre",
});
const groomingSatisfactionPenalty = useExtraGap("grooming_satisfaction_penalty", mid(8, 15), {
  unit: "satisfaction points on 0-100",
  metric: "Penalty for leaving all open terrain ungroomed",
  placeholder_range: "8-15 points when nothing open is groomed; partial scales with the ungroomed share",
  note: "Not a pack row. Required so grooming changes satisfaction. Scales with the share of open acres left ungroomed.",
  closest_sourced_proxy: "csat_national",
});

const acresByClass = useGap(
  "acreage_by_class_avg",
  {
    small: { acres: mid(50, 300), trails: mid(10, 30), lifts: mid(2, 6) },
    medium: { acres: mid(300, 1200), trails: mid(30, 70), lifts: mid(5, 10) },
    large: { acres: mid(1200, 3000), trails: mid(60, 120), lifts: mid(8, 15) },
    "extra-large": { acres: mid(3000, 7500), trails: mid(100, 350), lifts: mid(15, 40) },
  },
  "Midpoints of the unsourced class bands. Used when the resort is not in the sourced acreage examples."
);

const dayTicketElasticity = useGap(
  "daily_price_elasticity",
  mid(-1.5, -0.8),
  "Short-run day-ticket elasticity, midpoint of -0.8 to -1.5. Pass holders stay at about 0, from the same placeholder. Applied only to the day-ticket segment."
);
const passPriceElasticity = useExtraGap("pass_price_elasticity", 0, {
  unit: "elasticity",
  metric: "Posted-price elasticity of pass visits",
  placeholder_range: "~0 for pass holders (49% of visits)",
  note: "The daily_price_elasticity gap says pass holders are about 0. Day-ticket buyers use the midpoint of -0.8 to -1.5.",
  closest_sourced_proxy: "daily_price_elasticity",
});
const priceRatioFloor = useExtraGap("elasticity_price_ratio_floor", mid(0.05, 0.15), {
  unit: "share of the fair day price",
  metric: "Floor under the day-ticket price ratio",
  placeholder_range: "0.05-0.15 of the fair day price; below this the curve is flat so a $0 ticket stays finite",
  note: "Not a pack row. A zero price makes the constant-elasticity curve infinite. Prices at or below this share of the fair day price share one finite multiplier, and capacity still binds.",
  closest_sourced_proxy: "daily_price_elasticity",
});

const powderUpliftModerate = useGap(
  "powder_uplift_alpine",
  { moderate: mid(0.1, 0.4), deep: mid(0.2, 0.6), moderateInches: 6, deepInches: 12 },
  "U.S. alpine next-day uplift. Midpoint +25% after 6-12 inches, midpoint +40% after 12 inches or more. Applied to the following day, matching the timing in the La Grave study. La Grave's +54.5% / +121.5% are not used."
);

const staffCsatPerTenth = useGap(
  "staffing_satisfaction",
  mid(0.2, 0.5),
  "CSAT points lost per 10% staff shortfall on a busy day, midpoint of 0.2-0.5 on the 0-10 scale. Converted to 0-100 with the CSAT scale factor."
);
const staffShortfallStep = useExtraGap("staff_shortfall_step", 0.1, {
  unit: "share",
  metric: "Shortfall step in the staffing placeholder",
  placeholder_range: "each 10% staff shortfall",
  note: "The 10% step is the wording of staffing_satisfaction, not a separate estimate.",
  closest_sourced_proxy: "staffing_satisfaction",
});

const equipmentBaselineDowntime = useGap(
  "equipment_failure",
  { baseline: mid(0.01, 0.03), deferredLow: 2, deferredHigh: 3 },
  "Baseline daily lift-downtime probability, midpoint of 1-3%. Deferred maintenance multiplies it by 2 (partial groom) or 3 (no groom, or attendance below the seasonal crew). Those are the two ends of the 2-3x placeholder."
);

const bigBetCost = useGap(
  "big_bet_costs",
  {
    terrain_park: mid(250000, 2000000),
    lodge_upgrade: mid(5000000, 30000000),
    special_event: mid(50000, 500000),
  },
  "Midpoints of the unsourced cost bands. Park also consumes the sourced pipes-and-parks snowmaking share once it is built. Lodge midpoint is multi-year capex and will not pay back inside 12 prime weeks at these visit levels."
);
const bigBetUplift = useExtraGap(
  "big_bet_uplift",
  {
    terrain_park_visits: mid(0.02, 0.06),
    terrain_park_satisfaction: mid(3, 8),
    lodge_satisfaction: mid(4, 10),
    lodge_ancillary: mid(0.05, 0.15),
    event_visits: mid(0.05, 0.15),
    event_satisfaction: mid(2, 6),
  },
  {
    unit: "share or satisfaction points",
    metric: "Visit and satisfaction uplift of a big bet",
    placeholder_range:
      "park visits +2% to +6% and +3 to +8 satisfaction when the park is open; lodge +4 to +10 satisfaction and +5% to +15% dining/retail; event +5% to +15% visits and +2 to +6 satisfaction that day",
    note: "The big_bet_costs gap says visit and satisfaction uplift is unsourced and gives no numeric range. These ranges are flagged here so the bets are not free or automatically worthless. They are not from the source pack.",
    closest_sourced_proxy: "big_bet_costs",
  }
);
const eventCooldownDays = useExtraGap("special_event_cooldown_days", mid(7, 21), {
  unit: "days",
  metric: "Minimum days between special events",
  placeholder_range: "7-21 days",
  note: "Not a pack row. A terrain park or lodge upgrade is once per season. A special event can repeat after this cooldown. Midpoint of 7-21 days.",
  closest_sourced_proxy: "big_bet_costs",
});

const marketingUpliftPerDoubling = useGap(
  "marketing_response",
  mid(0.01, 0.05),
  "Visit change per doubling of marketing spend relative to the reference budget, midpoint of +1% to +5%. The curve is flat in percentage terms per doubling, so each extra dollar buys less."
);
const marketingShareAverage = shareOf(
  "marketing_share",
  "survey_average",
  anchors.get("marketing_share").value["survey average"],
  "Survey-average marketing budget, about 4% of revenue. This spend is the zero-uplift point on the doubling curve."
);
const marketingShareMax = shareOf(
  "marketing_share",
  "survey_max",
  "15%",
  "Top of the survey range (0.5%-15%). Daily marketing cap."
);
const marketingShareMin = shareOf(
  "marketing_share",
  "survey_min",
  "0.5%",
  "Bottom of the survey range. Informational; the decision floor is zero."
);
const marketingFloorRatio = useExtraGap("marketing_floor_ratio", mid(0.25, 0.5), {
  unit: "share of reference marketing spend",
  metric: "Floor of the marketing doubling curve",
  placeholder_range: "0.25-0.5 of the reference spend; a zero budget is evaluated here so log2 stays finite",
  note: "Not a pack row. Zero spend is two doublings below a 4% reference at the low end of this range, or one doubling at the high end. Used value is the midpoint.",
  closest_sourced_proxy: "marketing_response",
});

const rainVisitReduction = useGap(
  "weather_impact_rain",
  mid(0.3, 0.6),
  "Same-day visit reduction on a rain day, midpoint of 30-60%. Satisfaction loses the same number of points on the 0-100 scale."
);

const laborDayRate = useGap(
  "labor_cost_per_staff_day",
  mid(200, 320),
  "Fully loaded cost per worker-day, midpoint of $200-320."
);

const otherPaidFraction = useExtraGap("other_access_paid_fraction", mid(0, 1), {
  unit: "share of the other-access segment",
  metric: "Share of frequency/employee/comp visits that pay a pass-like yield",
  placeholder_range: "0-1; the access mix bundles frequency products with employee and comp",
  note: "Not a pack row. Half of the 20% other segment is treated as paid frequency at the pass yield, half as comp at zero. Midpoint of 0-1.",
  closest_sourced_proxy: "access_mix",
});
const passShareOfLiftRevenue = useExtraGap("pass_share_of_lift_revenue", mid(0.5, 0.6), {
  unit: "share of lift revenue",
  metric: "Pass products' share of lift revenue",
  placeholder_range: "0.50-0.60",
  note: "Not a pack row. Kottke, via the samwest anchor, says season passes surpassed day tickets for the larger share of ticket revenue in 2023-24, so the pass share is above half. No public split was fetched. Midpoint of 50-60% calibrates the fair day-ticket price against the $75 yield.",
  closest_sourced_proxy: "rev_per_visit_nsaa_record",
});

const defaultSizeClass = useExtraGap("default_size_class_acres_index", 1, {
  unit: "class index",
  metric: "Size class when a PowAlert resort matches neither a sourced ticket nor a sourced acreage example",
  placeholder_range: "medium",
  note: "Unnamed resorts use the medium acreage, revenue, and opex midpoints. Medium is the middle NSAA class, not a measured count of PowAlert resorts.",
  closest_sourced_proxy: "acreage_by_class_avg",
});

const meltCmPerDegree = useExtraGap("snow_melt_cm_per_degree", mid(0.5, 2), {
  unit: "cm of snow depth per degree C above freezing per day",
  metric: "Degree-day melt",
  placeholder_range: "0.5-2.0 cm per degree C above 0C; 0 at or below freezing",
  note: "Not a pack row. Without it, depth never falls and a rain event cannot strip the base. Midpoint.",
  closest_sourced_proxy: "open_depth",
});
const rainMeltRatio = useExtraGap("rain_melt_snow_per_rain", mid(8, 12), {
  unit: "cm of snow depth per cm of rain",
  metric: "Rain melt when temperature is above freezing",
  placeholder_range: "8-12 cm of snow per cm of rain (a 10:1 snow-to-water rule, bracketed)",
  note: "Not a pack row. Applied only when rain is falling and the daily average is above freezing.",
  closest_sourced_proxy: "weather_impact_rain",
});

const windHold = useExtraGap(
  "wind_hold",
  { sustainedMph: mid(40, 50), gustMph: mid(50, 60), satisfactionPenalty: mid(30, 50) },
  {
    unit: "mph and satisfaction points",
    metric: "Lift hold on high wind",
    placeholder_range: "sustained 40-50 mph or gusts 50-60 mph closes the lifts; satisfaction penalty 30-50 points",
    note: "Not a pack row. The stress harness requires a wind hold. Sourced temperature penalties are visit reductions, not closures, so extreme cold uses temp_demand and does not by itself close the mountain.",
    closest_sourced_proxy: "temp_demand",
  }
);

const crowding = useExtraGap(
  "crowding_satisfaction",
  { startFraction: mid(0.75, 0.95), penaltyAtCapacity: mid(8, 15) },
  {
    unit: "share of comfortable capacity, and points",
    metric: "Crowding penalty as visits approach comfortable capacity",
    placeholder_range: "penalty starts at 75-95% of comfortable capacity and reaches 8-15 points at 100%",
    note: "Not a pack row. Comfortable capacity is already the sourced 15-minute-wait utilization point, so a full mountain takes the full penalty.",
    closest_sourced_proxy: "utilization",
  }
);

const thinCoverSatisfaction = useExtraGap("thin_cover_satisfaction", mid(6, 14), {
  unit: "satisfaction points",
  metric: "Penalty at the open-depth threshold versus good cover",
  placeholder_range: "6-14 points at the 30 cm open threshold, 0 at the 18-24 inch good-cover midpoint",
  note: "Not a pack row. Interpolates between the sourced open depth and the unsourced good-cover depth.",
  closest_sourced_proxy: "open_depth",
});
const dayTicketThinMultiplier = useExtraGap("day_ticket_thin_cover_multiplier", mid(0.3, 0.5), {
  unit: "share of day-ticket demand retained",
  metric: "Day-ticket demand at the open-depth threshold",
  placeholder_range: "0.30-0.50 of day-ticket demand at 30 cm, rising to 1 at good cover. Pass visits are not scaled.",
  note: "Not a pack row. This is what makes a high posted price on a low-snow day crater the day-ticket segment while passholders still arrive. Pass elasticity stays 0.",
  closest_sourced_proxy: "daily_price_elasticity",
});

const terrainClosedPenalty = useExtraGap("terrain_closed_satisfaction", mid(5, 15), {
  unit: "satisfaction points",
  metric: "Penalty for keeping openable terrain closed",
  placeholder_range: "5-15 points if every zone that has cover is kept closed; scales with the closed share",
  note: "Not a pack row. Zones the depth threshold forces closed do not take this penalty; they take the thin-cover penalty.",
  closest_sourced_proxy: "csat_national",
});
const equipmentBreakdownSatisfaction = useExtraGap("equipment_breakdown_satisfaction", mid(3, 8), {
  unit: "satisfaction points",
  metric: "Penalty when the downtime roll takes a lift",
  placeholder_range: "3-8 points",
  note: "Not a pack row. Capacity also falls by one lift out of the class lift count.",
  closest_sourced_proxy: "equipment_failure",
});
const priceSatisfactionCap = useExtraGap("price_satisfaction_cap", mid(1, 2), {
  unit: "multiples of the anchor price",
  metric: "How far the value-for-price satisfaction gap scales",
  placeholder_range: "1-2 times the sourced CSAT gap (overall 8.7 minus value 8.2) per 100% above the market anchor, capped",
  note: "Not a pack row. The gap itself is sourced. The shape is linear in the percent above or below the size-and-region anchor, and the bonus for a cheap ticket is half the penalty.",
  closest_sourced_proxy: "csat_national",
});
const priceSatisfactionBonusRatio = useExtraGap("price_satisfaction_bonus_ratio", mid(0.25, 0.75), {
  unit: "share of the penalty gap",
  metric: "Satisfaction bonus for pricing under the market anchor",
  placeholder_range: "0.25-0.75 of the value-for-price gap, per 100% under the anchor",
  note: "Not a pack row. Cheap tickets help the value score by less than expensive tickets hurt it.",
  closest_sourced_proxy: "csat_national",
});

const regionFallbackFactor = useExtraGap("region_revenue_factor_fallback", 1, {
  unit: "index",
  metric: "Regional revenue index when the pack has no regional revenue figure",
  placeholder_range: "1 (no adjustment)",
  note: "Northeast and Midwest have no revenue-per-visit figure in the pack. They keep the size-class revenue. Pacific Northwest uses Scott $65/$113. Southeast uses NC $89.20 / Scott $113. Rockies and Pacific Southwest use 1.",
  closest_sourced_proxy: "rev_per_visit_region_scott",
});

const holidayCalendar = useDesign(
  "holiday_calendar",
  {
    christmasStartMonth: 12,
    christmasStartDay: 24,
    christmasEndMonth: 1,
    christmasEndDay: 1,
    thanksgivingMonth: 11,
    thanksgivingWeekday: 4,
    thanksgivingNth: 4,
    thanksgivingSpanDays: 4,
    mlkMonth: 1,
    mlkWeekday: 1,
    mlkNth: 3,
    presidentsMonth: 2,
    presidentsWeekday: 1,
    presidentsNth: 3,
    weekendLeadDays: 2,
    sunday: 0,
    saturday: 6,
    januaryIndex: 0,
    februaryIndex: 1,
    novemberIndex: 10,
    mayMonth: 5,
    seasonOpenMonth: 12,
    seasonOpenDay: 1,
  },
  "Calendar reading of the sourced holiday-period weight and of the unsourced Christmas-New Year week. Christmas Eve through New Year's Day. Thanksgiving is the fourth Thursday plus three days. MLK and Presidents Day include the weekend before the Monday. Weekday numbers are JavaScript UTC day indexes. These are dates, not visit estimates.",
  "calendar"
);

const stull = useExtraGap(
  "stull_2011_wet_bulb",
  {
    a: 0.151977,
    b: 8.313659,
    c: 1.676331,
    d: 0.00391838,
    e: 0.023101,
    f: 4.686035,
    rhExponent: 1.5,
  },
  {
    unit: "coefficients",
    metric: "Stull 2011 wet-bulb approximation",
    placeholder_range: "published coefficients",
    note: "Used only when the forecast includes humidity. Otherwise the snowmaking window uses the dry-bulb minimum. Not an economic parameter. Citation: Stull 2011, Journal of Applied Meteorology and Climatology 50(11).",
    closest_sourced_proxy: "snowmaking_temp_window",
  }
);

const derivedVisits = deriveVisitAnchors();

function deriveVisitAnchors() {
  const nationalAvg =
    (visitsUsMillion * million) / areasOperating / seasonLengthDays;
  const smallAvg = nationalAvg * (smallVisitShare / smallAreaShare);
  const nonSmallAvg =
    nationalAvg * ((1 - smallVisitShare) / (1 - smallAreaShare));
  const density = smallAvg / acresByClass.small.acres;
  const utilizationMid = mid(utilizationAnnualLow, utilizationAnnualHigh);
  const capacityMultiplier = utilizationAt15MinWait / utilizationMid;
  return {
    nationalAvgDailyVisits: nationalAvg,
    smallAvgDailyVisits: smallAvg,
    nonSmallAvgDailyVisits: nonSmallAvg,
    visitsPerAcrePerDay: density,
    utilizationMid,
    capacityMultiplier,
  };
}

useDerived(
  "national_avg_daily_visits",
  derivedVisits.nationalAvgDailyVisits,
  "visits_us_2526",
  "53.1 million visits / 492 areas / 110-day season. The parent year and URL are the visit total; area count and season length are areas_operating and season_length.",
  "visits per area per day"
);
useDerived(
  "small_avg_daily_visits",
  derivedVisits.smallAvgDailyVisits,
  "visits_by_size",
  "National average times (small visit share / small area share).",
  "visits per area per day"
);
useDerived(
  "visits_per_acre_per_day",
  derivedVisits.visitsPerAcrePerDay,
  "visits_by_size",
  "Small-area average daily visits divided by the unsourced small-class acreage midpoint. Named acreage and class midpoints scale capacity by this density. Non-small blended average is also derived and kept as a check; it is not a separate density because medium/large/XL area counts are not public.",
  "visits per acre per day"
);
useDerived(
  "non_small_avg_daily_visits_check",
  derivedVisits.nonSmallAvgDailyVisits,
  "visits_by_size",
  "Check figure only: national average times (non-small visit share / non-small area share). Not used to set a resort's capacity.",
  "visits per area per day"
);
useDerived(
  "capacity_multiplier",
  derivedVisits.capacityMultiplier,
  "utilization",
  "Comfortable capacity / average day = (25% wait-point utilization) / (midpoint of 10-13% annual utilization). Same ratio for every size.",
  "ratio"
);

const fairPriceIdentity = deriveFairPrice();

function deriveFairPrice() {
  const passYieldPerVisitContribution = passShareOfLiftRevenue * ticketYield;
  const passYieldNational = passYieldPerVisitContribution / passVisitShare;
  const remaining = ticketYield - passYieldPerVisitContribution;
  const otherLiftPerVisit =
    otherVisitShare * otherPaidFraction * passYieldNational;
  const dayLiftPerVisit = remaining - otherLiftPerVisit;
  const fairDayNational = dayLiftPerVisit / dayVisitShare;
  return { passYieldNational, fairDayNational, otherLiftPerVisit, dayLiftPerVisit };
}

useDerived(
  "fair_day_price_national",
  fairPriceIdentity.fairDayNational,
  "ticket_yield_2425",
  "Day-ticket price that, with the pass yield below, reproduces the $75 ticket yield at the national access mix. Scaled per resort by (lift share × revenue per visit) / $75. Elasticity is measured against this fair price, not against the peak window sticker.",
  "USD"
);
useDerived(
  "pass_yield_national",
  fairPriceIdentity.passYieldNational,
  "ticket_yield_2425",
  "Pass revenue per pass visit implied by assigning the unsourced 55% of lift revenue to the 49% pass segment.",
  "USD"
);

export const E = Object.freeze({
  percentScale,
  midpointDivisor,
  centsPerDollar,
  cmPerInch,
  cmPerFoot,
  mmPerCm,
  kmPerMile,
  fahrenheitScale,
  fahrenheitOffset,
  freezingC,
  log2Base,
  csatToHundred,
  million,
  schemaVersion,
  primeWeeks,
  daysPerWeek,
  satisfactionMin,
  satisfactionMax,
  decisionPriceFloor,
  forecastHorizonDays,
  oneBigBetPerDay,
  visitsUsMillion,
  areasOperating,
  seasonLengthDays,
  smallVisitShare,
  smallAreaShare,
  xlVisitShare,
  passVisitShare,
  dayVisitShare,
  otherVisitShare,
  liftRevenueShare,
  skiSchoolRevenueShare,
  diningRevenueShare,
  retailRevenueShare,
  otherRevenueShare,
  ticketYield,
  vailRevenuePerVisit,
  vailOpexPerVisit,
  laborShareOfOpex,
  vailOpexChange,
  vailVisitChange,
  scottPnwRevenue,
  scottRockiesRevenue,
  ncRevenuePerVisit,
  weekdayWeight,
  weekendWeight,
  holidayWeight,
  tempPenalty15,
  tempPenalty20,
  tempPenalty25,
  tempPenaltyHot,
  tempCold15C: tempThreshold15.cold15,
  tempCold20C: tempThreshold15.cold20,
  tempCold25C: tempThreshold15.cold25,
  tempHot15C: tempThreshold15.hot15,
  openDepthCm,
  utilizationAnnualLow,
  utilizationAnnualHigh,
  utilizationAt15MinWait,
  groomingCostPerHour,
  capexPerVisit,
  csatOverall,
  csatValueForPrice,
  parkSnowmakingShareLow,
  parkSnowmakingShareHigh,
  parkSnowmakingShare: mid(parkSnowmakingShareLow, parkSnowmakingShareHigh),
  revenueBySize,
  nationalRevenuePerVisit,
  opexBySize,
  fixedShare,
  variableShare: 1 - fixedShare,
  snowmakingCostPerAf,
  openingBaseAcreFeet,
  openingBaseAcreFeetHigh: baseAcreFeetHigh,
  snowmakingCostPerAfHigh: 2500,
  goodCoverInches,
  snowmakingShutoffF: snowmakingShutoffF.shutoffAboveF,
  snowmakingEfficientF: snowmakingShutoffF.efficientAtOrBelowF,
  snowmakingMarginalLowF: snowmakingShutoffF.marginalLowF,
  snowmakingMarginalHighF: snowmakingShutoffF.marginalHighF,
  snowmakingMarginalYield,
  snowmakingLagDays,
  groomingAcresPerHour,
  groomingPartialFraction,
  groomingSatisfactionPenalty,
  acresByClass,
  dayTicketElasticity,
  passPriceElasticity,
  priceRatioFloor,
  powderUpliftModerate: powderUpliftModerate.moderate,
  powderUpliftDeep: powderUpliftModerate.deep,
  powderModerateInches: powderUpliftModerate.moderateInches,
  powderDeepInches: powderUpliftModerate.deepInches,
  staffCsatPerTenth,
  staffShortfallStep,
  equipmentBaselineDowntime: equipmentBaselineDowntime.baseline,
  equipmentDeferredLow: equipmentBaselineDowntime.deferredLow,
  equipmentDeferredHigh: equipmentBaselineDowntime.deferredHigh,
  bigBetCost,
  bigBetUplift,
  eventCooldownDays,
  marketingUpliftPerDoubling,
  marketingShareAverage,
  marketingShareMax,
  marketingShareMin,
  marketingFloorRatio,
  rainVisitReduction,
  laborDayRate,
  otherPaidFraction,
  passShareOfLiftRevenue,
  defaultSizeClass,
  meltCmPerDegree,
  rainMeltRatio,
  windHoldSustainedMph: windHold.sustainedMph,
  windHoldGustMph: windHold.gustMph,
  windHoldSatisfaction: windHold.satisfactionPenalty,
  crowdingStart: crowding.startFraction,
  crowdingPenalty: crowding.penaltyAtCapacity,
  thinCoverSatisfaction,
  dayTicketThinMultiplier,
  terrainClosedPenalty,
  equipmentBreakdownSatisfaction,
  priceSatisfactionCap,
  priceSatisfactionBonusRatio,
  regionFallbackFactor,
  holidayCalendar,
  stull,
  nationalAvgDailyVisits: derivedVisits.nationalAvgDailyVisits,
  smallAvgDailyVisits: derivedVisits.smallAvgDailyVisits,
  nonSmallAvgDailyVisits: derivedVisits.nonSmallAvgDailyVisits,
  visitsPerAcrePerDay: derivedVisits.visitsPerAcrePerDay,
  utilizationMid: derivedVisits.utilizationMid,
  capacityMultiplier: derivedVisits.capacityMultiplier,
  fairDayNational: fairPriceIdentity.fairDayNational,
  passYieldNational: fairPriceIdentity.passYieldNational,
  seasonDays: primeWeeks * daysPerWeek,
  guaranteedLaborFraction:
    1 - Math.min(1, (1 - fixedShare) / laborShareOfOpex),
});

export function usedCatalog() {
  return used.map((row) => ({ ...row }));
}

export function referenceCatalog() {
  return referenceOnly.map((row) => ({ ...row }));
}

export function gapById(id) {
  return gaps.get(id) ?? null;
}

export function anchorById(id) {
  return anchors.get(id) ?? null;
}

export function cToF(celsius) {
  return celsius * E.fahrenheitScale + E.fahrenheitOffset;
}

export function fToC(fahrenheit) {
  return (fahrenheit - E.fahrenheitOffset) / E.fahrenheitScale;
}

export function money(amount) {
  if (!Number.isFinite(amount)) return amount;
  return Math.round(amount * E.centsPerDollar) / E.centsPerDollar;
}

export function clamp(value, low, high) {
  return Math.min(high, Math.max(low, value));
}

/**
 * Parse a sourced ticket cell into a min / max / anchor.
 * "45/81" is weekday/weekend; the weekend rate is the anchor.
 * "100-115" uses the midpoint as the anchor.
 */
export function parseTicketCell(value) {
  if (typeof value === "number") {
    return { min: value, max: value, anchor: value };
  }
  const text = String(value).replace(/[~$,]/g, "").trim();
  if (text.includes("/")) {
    const parts = text.split("/").map(Number);
    const min = Math.min(...parts);
    const max = Math.max(...parts);
    return { min, max, anchor: max };
  }
  if (text.includes("-")) {
    const parts = text.split("-").map(Number);
    const min = Math.min(...parts);
    const max = Math.max(...parts);
    return { min, max, anchor: mid(min, max) };
  }
  const n = Number(text);
  return { min: n, max: n, anchor: n };
}

export function ticketBook() {
  return {
    peak2627: anchors.get("ticket_peak_2627").value,
    small2526: anchors.get("ticket_small_2526").value,
    acreage: anchors.get("acreage_examples").value,
  };
}

export function median(values) {
  const sorted = [...values].filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const midIndex = Math.floor(sorted.length / E.midpointDivisor);
  if (sorted.length % E.midpointDivisor) return sorted[midIndex];
  return (sorted[midIndex - 1] + sorted[midIndex]) / E.midpointDivisor;
}

export const CAVEAT =
  "NSAA national revenue per visit and operating cost per visit are paywalled. " +
  "Revenue and cost anchors are Vail FY26 ($163.62 revenue and $116 opex per visit) " +
  "and NSAA's $75 ticket yield. Costs are mostly fixed. Passes are 49% of visits and " +
  "day tickets about 31%, so price elasticity applies to the day-ticket segment. " +
  "Ticket windows are the sourced size and region ranges.";
