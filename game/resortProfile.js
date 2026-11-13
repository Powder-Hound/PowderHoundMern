import { addDays, meanWeight } from "./calendar.js";
import {
  E,
  firstNumber,
  median,
  parseTicketCell,
  ticketBook,
} from "./economics.config.js";

/** NSAA region for a U.S. state. Classification, not an economic estimate. */
export const STATE_TO_REGION = Object.freeze({
  Colorado: "Rocky Mountain",
  Utah: "Rocky Mountain",
  "New Mexico": "Rocky Mountain",
  Wyoming: "Rocky Mountain",
  Montana: "Rocky Mountain",
  Idaho: "Rocky Mountain",
  Washington: "Pacific Northwest",
  Oregon: "Pacific Northwest",
  Alaska: "Pacific Northwest",
  California: "Pacific Southwest",
  Nevada: "Pacific Southwest",
  Arizona: "Pacific Southwest",
  Minnesota: "Midwest",
  Wisconsin: "Midwest",
  Michigan: "Midwest",
  "North Dakota": "Midwest",
  "South Dakota": "Midwest",
  Iowa: "Midwest",
  Illinois: "Midwest",
  Indiana: "Midwest",
  Ohio: "Midwest",
  Missouri: "Midwest",
  Nebraska: "Midwest",
  Kansas: "Midwest",
  Maine: "Northeast",
  "New Hampshire": "Northeast",
  Vermont: "Northeast",
  Massachusetts: "Northeast",
  Connecticut: "Northeast",
  "Rhode Island": "Northeast",
  "New York": "Northeast",
  Pennsylvania: "Northeast",
  "New Jersey": "Northeast",
  "North Carolina": "Southeast",
  Virginia: "Southeast",
  "West Virginia": "Southeast",
  Tennessee: "Southeast",
  Georgia: "Southeast",
  Maryland: "Southeast",
});

/**
 * Named resorts whose window price or acreage is in the source pack.
 * Size is the cluster that resort sits in on the sourced price list
 * (under $150 small, $150–229 medium, $230–299 large, $300+ extra-large).
 * Those breaks are the gaps in ticket_peak_2627, not a new price series.
 */
const NAMED = [
  { names: ["beaver creek"], ticket: ["peak2627", "Beaver Creek"], size: "extra-large" },
  { names: ["vail"], ticket: ["peak2627", "Vail"], size: "extra-large" },
  { names: ["park city", "park city mountain"], ticket: ["peak2627", "Park City"], acres: "Park City UT", size: "extra-large" },
  { names: ["deer valley"], ticket: ["peak2627", "Deer Valley"], acres: "Deer Valley UT", size: "extra-large" },
  { names: ["steamboat"], ticket: ["peak2627", "Steamboat"], size: "extra-large" },
  { names: ["breckenridge"], ticket: ["peak2627", "Breckenridge"], size: "extra-large" },
  { names: ["telluride"], ticket: ["peak2627", "Telluride"], size: "extra-large" },
  { names: ["aspen snowmass", "aspen"], ticket: ["peak2627", "Aspen"], size: "extra-large" },
  { names: ["keystone"], ticket: ["peak2627", "Keystone"], size: "large" },
  { names: ["copper mountain", "copper"], ticket: ["peak2627", "Copper"], size: "large" },
  { names: ["winter park"], ticket: ["peak2627", "Winter Park"], size: "large" },
  { names: ["crested butte"], ticket: ["peak2627", "Crested Butte"], size: "large" },
  { names: ["snowbird"], ticket: ["peak2627", "Snowbird"], size: "large" },
  { names: ["solitude"], ticket: ["peak2627", "Solitude"], size: "medium" },
  { names: ["arapahoe basin"], ticket: ["peak2627", "Arapahoe Basin"], size: "medium" },
  { names: ["eldora"], ticket: ["peak2627", "Eldora"], size: "medium" },
  { names: ["loveland"], ticket: ["peak2627", "Loveland"], size: "medium" },
  { names: ["monarch"], ticket: ["peak2627", "Monarch (online)"], size: "small" },
  { names: ["wolf creek"], ticket: ["peak2627", "Wolf Creek"], size: "small" },
  { names: ["ski cooper"], ticket: ["peak2627", "Ski Cooper"], size: "small" },
  { names: ["hesperus"], ticket: ["peak2627", "Hesperus"], size: "small" },
  { names: ["mohawk"], ticket: ["small2526", "Mohawk Mtn CT weekday/weekend"], acres: "Mohawk CT", size: "small", region: "Northeast" },
  { names: ["chestnut"], ticket: ["small2526", "Chestnut Mtn IL weekday/weekend"], size: "small", region: "Midwest" },
  { names: ["nubs nob", "nub s nob"], ticket: ["small2526", "Nub's Nob MI (advance)"], size: "small", region: "Midwest" },
  { names: ["devil s head", "devils head"], ticket: ["small2526", "Devil's Head WI weekday/weekend"], acres: "Devil's Head WI", size: "small", region: "Midwest" },
  { names: ["wildcat"], ticket: ["small2526", "Wildcat NH"], acres: "Wildcat NH", size: "small", region: "Northeast" },
  { names: ["mad river glen"], ticket: ["small2526", "Mad River Glen VT"], size: "small", region: "Northeast" },
  { names: ["cannon"], ticket: ["small2526", "Cannon NH online/window"], acres: "Cannon NH", size: "small", region: "Northeast" },
  { names: ["bridger bowl", "bridger"], ticket: ["small2526", "Bridger Bowl MT online/window"], acres: "Bridger Bowl MT", size: "small", region: "Rocky Mountain" },
  { names: ["whitefish"], ticket: ["small2526", "Whitefish MT"], acres: "Whitefish MT", size: "small", region: "Rocky Mountain" },
  { names: ["beaver mountain", "beaver mtn"], ticket: ["small2526", "Beaver Mtn UT"], acres: "Beaver Mtn UT", size: "small", region: "Rocky Mountain" },
  { names: ["snowy range"], ticket: ["small2526", "Snowy Range WY weekday/weekend"], size: "small", region: "Rocky Mountain" },
  { names: ["49 degrees north"], ticket: ["small2526", "49 Degrees North WA"], acres: "49 Degrees North WA", size: "small", region: "Pacific Northwest" },
  { names: ["magic mountain"], states: ["Idaho"], ticket: ["small2526", "Magic Mtn ID"], acres: "Magic Mtn ID", size: "small", region: "Rocky Mountain" },
  { names: ["magic mountain"], states: ["Vermont"], ticket: ["small2526", "Magic Mtn VT (online)"], size: "small", region: "Northeast" },
  { names: ["donner ski ranch"], acres: "Donner Ski Ranch CA", size: "medium", region: "Pacific Southwest" },
  { names: ["sunlight"], acres: "Sunlight CO", size: "medium", region: "Rocky Mountain" },
  { names: ["mt hood skibowl", "mount hood skibowl"], acres: "Mt Hood Skibowl OR", size: "medium", region: "Pacific Northwest" },
];

function normalizeName(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(resort|ski area|ski resort|the)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function ticketCell(ref) {
  if (!ref) return null;
  const book = ticketBook();
  const table = ref[0] === "peak2627" ? book.peak2627 : book.small2526;
  const raw = table[ref[1]];
  if (raw == null) return null;
  return parseTicketCell(raw);
}

function acresFromKey(key) {
  if (!key) return null;
  const raw = ticketBook().acreage[key];
  const n = firstNumber(raw);
  return Number.isFinite(n) ? n : null;
}

export function regionForState(state) {
  if (!state) return null;
  return STATE_TO_REGION[String(state).trim()] ?? null;
}

export function matchResort(resort) {
  const name = normalizeName(resort?.resortName || resort?.name);
  const state = resort?.State || resort?.state || "";
  const hits = NAMED.filter((row) => {
    if (row.states && !row.states.includes(state)) return false;
    return row.names.some((alias) => normalizeName(alias) === name);
  });
  hits.sort((a, b) => b.names[0].length - a.names[0].length);
  const row = hits[0];
  if (!row) return null;
  const price = ticketCell(row.ticket);
  return {
    size: row.size,
    region: row.region ?? null,
    acres: acresFromKey(row.acres),
    price,
    matchedName: row.names[0],
  };
}

function regionFactor(region) {
  if (region === "Pacific Northwest") return E.scottPnwRevenue / E.scottRockiesRevenue;
  if (region === "Southeast") return E.ncRevenuePerVisit / E.scottRockiesRevenue;
  if (region === "Rocky Mountain" || region === "Pacific Southwest") {
    return E.scottRockiesRevenue / E.scottRockiesRevenue;
  }
  return E.regionFallbackFactor;
}

function allTicketCells() {
  const book = ticketBook();
  return [...Object.values(book.peak2627), ...Object.values(book.small2526)].map(parseTicketCell);
}

function cellsFor(region, size) {
  return NAMED.filter((row) => {
    const rowRegion = row.region || "Rocky Mountain";
    return rowRegion === region && row.size === size && row.ticket;
  })
    .map((row) => ticketCell(row.ticket))
    .filter(Boolean);
}

export function ticketWindow(region, size, ownPrice) {
  let cells = region ? cellsFor(region, size) : [];
  let source = "size_and_region";
  if (!cells.length) {
    cells = NAMED.filter((row) => row.size === size && row.ticket)
      .map((row) => ticketCell(row.ticket))
      .filter(Boolean);
    source = "size_national_fallback";
  }
  if (!cells.length) {
    cells = allTicketCells();
    source = "national_fallback";
  }
  if (ownPrice) cells = cells.concat(ownPrice);
  const min = Math.min(...cells.map((cell) => cell.min));
  const max = Math.max(...cells.map((cell) => cell.max));
  const anchor = ownPrice ? ownPrice.anchor : median(cells.map((cell) => cell.anchor));
  const nationalMax = Math.max(...allTicketCells().map((cell) => cell.max));
  return {
    marketMin: min,
    marketMax: max,
    marketAnchor: anchor,
    decisionMin: E.decisionPriceFloor,
    decisionMax: Math.max(nationalMax, max),
    source,
  };
}

export function groomingCostForAcres(acres, fraction) {
  if (!(acres > 0) || !(fraction > 0)) return 0;
  const hours = (acres * fraction) / E.groomingAcresPerHour;
  return hours * E.groomingCostPerHour;
}

export function buildProfile(resort, startDate) {
  const matched = matchResort(resort);
  const region = regionForState(resort?.State || resort?.state) || matched?.region || null;
  const size = matched?.size || "medium";
  const physical = E.acresByClass[size] || E.acresByClass.medium;
  const acres = matched?.acres || physical.acres;
  const avgDailyVisits = acres * E.visitsPerAcrePerDay;
  const comfortableCapacity = avgDailyVisits * E.capacityMultiplier;
  const revenuePerVisit = (E.revenueBySize[size] ?? E.revenueBySize.medium) * regionFactor(region);
  const opexPerVisit = E.opexBySize[size] ?? E.opexBySize.medium;
  const liftTarget = E.liftRevenueShare * revenuePerVisit;
  const scale = liftTarget / E.ticketYield;
  const fairDayPrice = E.fairDayNational * scale;
  const passYield = E.passYieldNational * scale;
  const window = ticketWindow(region, size, matched?.price || null);
  const referenceOpex = opexPerVisit * avgDailyVisits;
  const referenceLabor = E.laborShareOfOpex * referenceOpex;
  const includedGrooming = groomingCostForAcres(acres, E.groomingPartialFraction);
  const marketingReference = E.marketingShareAverage * revenuePerVisit * avgDailyVisits;
  const marketingMax = E.marketingShareMax * revenuePerVisit * avgDailyVisits;
  const otherFixedPerDay = Math.max(
    0,
    referenceOpex - referenceLabor - includedGrooming - marketingReference
  );
  const workersPerVisit = (E.laborShareOfOpex * opexPerVisit) / E.laborDayRate;
  const standardHeadcount = workersPerVisit * avgDailyVisits;
  const guaranteedHeadcount = standardHeadcount * E.guaranteedLaborFraction;
  const guaranteedLaborCost = referenceLabor * E.guaranteedLaborFraction;
  const maxHeadcount = workersPerVisit * comfortableCapacity;
  const snowmakingBudgetMax =
    acres * E.openingBaseAcreFeetHigh * E.snowmakingCostPerAfHigh;
  const mean = meanWeight(startDate, E.seasonDays);
  return {
    powalertResortId: String(resort?._id ?? resort?.id ?? ""),
    name: resort?.resortName || resort?.name || "Resort",
    state: resort?.State || resort?.state || null,
    region,
    sizeClass: size,
    sizeSource: matched ? "sourced_ticket_or_acreage" : "default_medium",
    matchedName: matched?.matchedName ?? null,
    acres,
    acresSource: matched?.acres ? "acreage_examples" : "class_midpoint",
    trails: physical.trails,
    lifts: physical.lifts,
    avgDailyVisits,
    comfortableCapacity,
    meanWeight: mean,
    revenuePerVisit,
    opexPerVisit,
    fairDayPrice,
    passYield,
    ...window,
    referenceOpex,
    referenceLabor,
    otherFixedPerDay,
    fixedBaseClamped: referenceOpex - referenceLabor - includedGrooming - marketingReference < 0,
    workersPerVisit,
    standardHeadcount,
    guaranteedHeadcount,
    guaranteedLaborCost,
    laborDayRate: E.laborDayRate,
    maxHeadcount,
    marketingReference,
    marketingMax,
    snowmakingBudgetMax,
    seasonStart: startDate,
    seasonEnd: addDays(startDate, E.seasonDays - 1),
    regionRevenueFactor: regionFactor(region),
  };
}
