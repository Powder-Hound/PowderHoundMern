import { E } from "./economics.config.js";

export const GROOMING_SCHEDULES = Object.freeze(["none", "partial", "full"]);
export const BIG_BETS = Object.freeze(["terrain_park", "lodge_upgrade", "special_event"]);
export const BASE_ZONES = Object.freeze(["beginner", "intermediate", "advanced"]);
export const TERRAIN_ZONES = Object.freeze([...BASE_ZONES, "terrain_park"]);

const DECISION_FIELDS = [
  "liftTicketPrice",
  "snowmakingBudget",
  "groomingSchedule",
  "terrainOpen",
  "staffingLevel",
  "marketingSpend",
  "bigBet",
];

export function zonesFor(state) {
  const zones = [...BASE_ZONES];
  if (state.assets?.terrainPark) zones.push("terrain_park");
  return zones;
}

export function decisionBounds(state) {
  const profile = state.profile;
  return {
    liftTicketPrice: {
      min: profile.decisionMin,
      max: profile.decisionMax,
      marketMin: profile.marketMin,
      marketMax: profile.marketMax,
      anchor: profile.marketAnchor,
      fair: profile.fairDayPrice,
    },
    snowmakingBudget: { min: 0, max: profile.snowmakingBudgetMax },
    groomingSchedule: { choices: GROOMING_SCHEDULES },
    terrainOpen: { allowed: zonesFor(state) },
    staffingLevel: {
      min: 0,
      max: profile.maxHeadcount,
      guaranteed: profile.guaranteedHeadcount,
      standard: profile.standardHeadcount,
    },
    marketingSpend: {
      min: 0,
      max: profile.marketingMax,
      reference: profile.marketingReference,
    },
    bigBet: {
      choices: [null, ...BIG_BETS],
      perDay: E.oneBigBetPerDay,
    },
  };
}

function finite(value) {
  return typeof value === "number" && Number.isFinite(value);
}

export function validateDecisions(state, input) {
  const errors = [];
  const bounds = decisionBounds(state);
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, errors: [{ field: "body", message: "Decisions must be an object" }], decisions: null };
  }
  for (const key of Object.keys(input)) {
    if (!DECISION_FIELDS.includes(key)) {
      errors.push({ field: key, message: "Unknown decision" });
    }
  }
  const price = input.liftTicketPrice;
  if (!finite(price) || price < bounds.liftTicketPrice.min || price > bounds.liftTicketPrice.max) {
    errors.push({
      field: "liftTicketPrice",
      message: "Out of bounds",
      min: bounds.liftTicketPrice.min,
      max: bounds.liftTicketPrice.max,
      got: price ?? null,
    });
  }
  const snow = input.snowmakingBudget;
  if (!finite(snow) || snow < bounds.snowmakingBudget.min || snow > bounds.snowmakingBudget.max) {
    errors.push({
      field: "snowmakingBudget",
      message: "Out of bounds",
      min: bounds.snowmakingBudget.min,
      max: bounds.snowmakingBudget.max,
      got: snow ?? null,
    });
  }
  if (!GROOMING_SCHEDULES.includes(input.groomingSchedule)) {
    errors.push({
      field: "groomingSchedule",
      message: "Choose none, partial, or full",
      choices: GROOMING_SCHEDULES,
      got: input.groomingSchedule ?? null,
    });
  }
  const allowed = new Set(bounds.terrainOpen.allowed);
  const terrain = input.terrainOpen;
  if (!Array.isArray(terrain) || terrain.some((zone) => !allowed.has(zone))) {
    errors.push({
      field: "terrainOpen",
      message: "Terrain must be a list of open zones",
      allowed: bounds.terrainOpen.allowed,
      got: terrain ?? null,
    });
  } else if (new Set(terrain).size !== terrain.length) {
    errors.push({ field: "terrainOpen", message: "Duplicate zone" });
  }
  const staff = input.staffingLevel;
  if (!finite(staff) || staff < bounds.staffingLevel.min || staff > bounds.staffingLevel.max) {
    errors.push({
      field: "staffingLevel",
      message: "Out of bounds",
      min: bounds.staffingLevel.min,
      max: bounds.staffingLevel.max,
      got: staff ?? null,
    });
  }
  const marketing = input.marketingSpend;
  if (!finite(marketing) || marketing < bounds.marketingSpend.min || marketing > bounds.marketingSpend.max) {
    errors.push({
      field: "marketingSpend",
      message: "Out of bounds",
      min: bounds.marketingSpend.min,
      max: bounds.marketingSpend.max,
      got: marketing ?? null,
    });
  }
  const bet = input.bigBet ?? null;
  if (!(bet === null || BIG_BETS.includes(bet))) {
    errors.push({
      field: "bigBet",
      message: "Choose null, terrain_park, lodge_upgrade, or special_event",
      got: bet,
    });
  } else if (bet) {
    const until = state.cooldowns?.[bet];
    if (until && state.calendar.currentDate < until) {
      errors.push({
        field: "bigBet",
        message: `${bet} is on cooldown until ${until}`,
        until,
      });
    }
    if (bet === "terrain_park" && state.assets?.terrainPark) {
      errors.push({ field: "bigBet", message: "Terrain park is already built" });
    }
    if (bet === "lodge_upgrade" && state.assets?.lodgeUpgrade) {
      errors.push({ field: "bigBet", message: "Lodge upgrade is already built" });
    }
  }
  if (errors.length) return { ok: false, errors, decisions: null };
  return {
    ok: true,
    errors: [],
    decisions: {
      liftTicketPrice: price,
      snowmakingBudget: snow,
      groomingSchedule: input.groomingSchedule,
      terrainOpen: [...terrain],
      staffingLevel: staff,
      marketingSpend: marketing,
      bigBet: bet,
    },
  };
}
