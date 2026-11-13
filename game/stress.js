/**
 * Stress harness for the resort-management day resolver.
 * Pure: no Mongo, no network. The npm script and the tests both call runStress().
 */

import { demandWeight } from "./calendar.js";
import { validateDecisions } from "./decisions.js";
import { E } from "./economics.config.js";
import { buildProfile } from "./resortProfile.js";
import { createInitialState, resolveDay, suggestedDecisions } from "./simulate.js";
import { syntheticDay } from "./weather.js";

export const STRESS_SEED = 20261113;
export const SEASON_START = "2026-12-05";

export function referenceResort() {
  return {
    _id: "66eb1b97cbd1c8aacee63a79",
    resortName: "Cherry Peak Resort",
    State: "Utah",
  };
}

export function referenceProfile() {
  return buildProfile(referenceResort(), SEASON_START);
}

function freshState(overrides = {}) {
  const profile = overrides.profile || referenceProfile();
  const state = createInitialState({
    profile,
    startDate: overrides.startDate || profile.seasonStart,
    seed: overrides.seed ?? STRESS_SEED,
    userId: "stress",
    initialDepthCm: overrides.depthCm ?? E.goodCoverInches * E.cmPerInch,
  });
  if (overrides.lastSnowfallCm != null) state.lastSnowfallCm = overrides.lastSnowfallCm;
  if (overrides.date) state.calendar.currentDate = overrides.date;
  return state;
}

function play(state, decisions, weather, options) {
  const check = validateDecisions(state, decisions);
  if (!check.ok) {
    return { ok: false, errors: check.errors, state, result: null };
  }
  return resolveDay(state, check.decisions, weather, options);
}

function baseDecisions(state, patch = {}) {
  const suggested = suggestedDecisions(state, { date: state.calendar.currentDate });
  return { ...suggested, bigBet: null, ...patch };
}

export function walk(value, path, problems) {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) problems.push(`${path} is ${value}`);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    walk(child, `${path}.${key}`, problems);
  }
}

export function sanityProblems(result, profile) {
  const problems = [];
  if (!result) return ["missing result"];
  walk(result, "result", problems);
  const visits = result.visits?.total;
  if (visits < 0) problems.push("negative visits");
  if (visits > profile.comfortableCapacity + 1e-6) problems.push("visits above capacity");
  if (result.visits.dayTicket < -1e-9 || result.visits.pass < -1e-9 || result.visits.other < -1e-9) {
    problems.push("negative segment");
  }
  const sat = result.satisfaction;
  if (sat < E.satisfactionMin || sat > E.satisfactionMax) problems.push("satisfaction out of range");
  if (result.snow.depthEndCm < -1e-9) problems.push("negative depth");
  if (result.revenue.total < -1e-6 || result.cost.total < -1e-6) problems.push("negative revenue or cost");
  const parts = result.revenue.bySource;
  const sum = parts.lift + parts.skiSchool + parts.dining + parts.retailRental + parts.other;
  if (Math.abs(sum - result.revenue.total) > 0.02) problems.push("revenue split does not add up");
  return problems;
}

function summarize(id, played, profile) {
  const result = played.result;
  return {
    id,
    ok: played.ok,
    errors: played.errors || [],
    problems: result ? sanityProblems(result, profile) : ["no result"],
    visits: result?.visits.total ?? null,
    dayVisits: result?.visits.dayTicket ?? null,
    passVisits: result?.visits.pass ?? null,
    unconstrained: result?.visits.unconstrained ?? null,
    cappedBy: result?.visits.cappedBy ?? null,
    capacity: profile.comfortableCapacity,
    revenue: result?.revenue.total ?? null,
    cost: result?.cost.total ?? null,
    profit: result?.profit ?? null,
    satisfaction: result?.satisfaction ?? null,
    depthEndCm: result?.snow.depthEndCm ?? null,
    clamps: result?.clamps ?? [],
    impacts: result?.weather.impacts ?? [],
  };
}

function coldDay(date, extra = {}) {
  return syntheticDay(date, {
    tempMinC: -12,
    tempAvgC: -8,
    tempMaxC: -3,
    humidity: null,
    snowfallCm: 0,
    rain: false,
    ...extra,
  });
}

export function runStress() {
  const profile = referenceProfile();
  const scenarios = [];
  const clampsObserved = [];

  function keep(summary) {
    scenarios.push(summary);
    for (const clamp of summary.clamps || []) clampsObserved.push({ id: summary.id, clamp });
  }

  // 1. Zero-snow December. No natural snow, no snowmaking, depth starts at 0.
  {
    let state = freshState({ depthCm: 0, date: "2026-12-06" });
    const days = [];
    for (let i = 0; i < 14; i += 1) {
      const date = state.calendar.currentDate;
      const decisions = baseDecisions(state, {
        snowmakingBudget: 0,
        terrainOpen: ["beginner", "intermediate", "advanced"],
      });
      const played = play(state, decisions, coldDay(date));
      days.push(summarize(`zero-snow-${i}`, played, profile));
      if (!played.ok) break;
      state = played.state;
    }
    const problems = days.flatMap((day) => day.problems);
    if (days.some((day) => day.visits !== 0)) problems.push("zero-snow day produced visits");
    if (days.some((day) => !(day.cost > 0))) problems.push("zero-snow day had no cost");
    keep({
      id: "zero-snow-december",
      ok: problems.length === 0,
      problems,
      visits: 0,
      cost: days[0]?.cost ?? null,
      days: days.length,
      clamps: days.flatMap((day) => day.clamps),
    });
  }

  // 2. Sold-out powder weekend. Christmas Saturday (also a holiday) after 14 inches.
  // A non-holiday Saturday at the +40% midpoint stays just under the utilization cap.
  {
    const date = "2026-12-26";
    const state = freshState({
      date,
      lastSnowfallCm: 14 * E.cmPerInch,
    });
    const decisions = baseDecisions(state, {
      staffingLevel: profile.maxHeadcount,
      terrainOpen: ["beginner", "intermediate", "advanced"],
      groomingSchedule: "full",
    });
    const played = play(state, decisions, coldDay(date));
    const summary = summarize("powder-weekend", played, profile);
    if (!(summary.unconstrained > summary.capacity)) summary.problems.push("powder day did not exceed capacity");
    if (Math.abs(summary.visits - summary.capacity) > 1e-6) summary.problems.push("powder day was not capped");
    keep(summary);
  }

  // 3. Rain event versus the same day dry.
  {
    const date = "2026-12-12";
    const decisionsFor = (state) =>
      baseDecisions(state, {
        staffingLevel: profile.maxHeadcount,
        groomingSchedule: "full",
        terrainOpen: ["beginner", "intermediate", "advanced"],
      });
    const dryState = freshState({ date });
    const rainState = freshState({ date });
    const dry = play(
      dryState,
      decisionsFor(dryState),
      coldDay(date, { tempAvgC: 5, tempMinC: 2, tempMaxC: 8 })
    );
    const rain = play(
      rainState,
      decisionsFor(rainState),
      syntheticDay(date, {
        tempAvgC: 5,
        tempMinC: 2,
        tempMaxC: 8,
        humidity: null,
        rain: true,
        precipMm: 12,
        precipType: ["rain"],
        snowfallCm: 0,
      })
    );
    const summary = summarize("rain-event", rain, profile);
    const ratio = dry.result && rain.result ? rain.result.visits.total / dry.result.visits.total : null;
    summary.dryVisits = dry.result?.visits.total ?? null;
    summary.visitRatio = ratio;
    summary.depthDelta = rain.result && dry.result
      ? dry.result.snow.depthEndCm - rain.result.snow.depthEndCm
      : null;
    if (!(ratio < 0.7 && ratio > 0.4)) summary.problems.push(`rain visit ratio ${ratio} outside 0.4-0.7`);
    if (!(summary.depthDelta > 0)) summary.problems.push("rain did not melt more snow than the dry day");
    keep(summary);
  }

  // 4. Wind hold with extreme cold. Visits must be zero. Cold itself is a sourced reduction, not a closure.
  {
    const date = "2026-12-15";
    const state = freshState({ date });
    const played = play(
      state,
      baseDecisions(state, { staffingLevel: profile.maxHeadcount, groomingSchedule: "full" }),
      syntheticDay(date, {
        tempAvgC: -30,
        tempMinC: -34,
        tempMaxC: -26,
        humidity: null,
        windKmh: 80 * E.kmPerMile,
        windGustKmh: 90 * E.kmPerMile,
      })
    );
    const summary = summarize("wind-hold-extreme-cold", played, profile);
    if (summary.visits !== 0) summary.problems.push("wind hold did not zero visits");
    if (!summary.impacts.includes("wind_hold")) summary.problems.push("missing wind_hold impact");
    if (!summary.impacts.includes("temperature")) summary.problems.push("missing temperature impact");
    keep(summary);
  }

  // 5 and 6. $0 and maximum price on a low-snow weekend.
  {
    const date = "2026-12-12";
    const depthCm = E.openDepthCm;
    const make = (price) => {
      const state = freshState({ date, depthCm, lastSnowfallCm: 0 });
      return play(
        state,
        baseDecisions(state, {
          liftTicketPrice: price,
          staffingLevel: profile.maxHeadcount,
          groomingSchedule: "full",
        }),
        coldDay(date)
      );
    };
    const free = make(E.decisionPriceFloor);
    const maxed = make(profile.decisionMax);
    const anchor = make(profile.marketAnchor);
    const freeSummary = summarize("price-zero", free, profile);
    const maxSummary = summarize("price-maximum-low-snow", maxed, profile);
    const dayRatio =
      anchor.result && maxed.result && anchor.result.visits.dayTicket > 0
        ? maxed.result.visits.dayTicket / anchor.result.visits.dayTicket
        : null;
    maxSummary.dayVisitRatioVersusAnchor = dayRatio;
    maxSummary.anchorDayVisits = anchor.result?.visits.dayTicket ?? null;
    maxSummary.anchorPassVisits = anchor.result?.visits.pass ?? null;
    maxSummary.passVisits = maxed.result?.visits.pass ?? null;
    if (!(dayRatio < 0.6)) maxSummary.problems.push(`day visits did not crater (${dayRatio})`);
    if (Math.abs((anchor.result?.visits.pass ?? 0) - (maxed.result?.visits.pass ?? 0)) > 1e-6) {
      maxSummary.problems.push("pass visits moved with the day-ticket price");
    }
    keep(freeSummary);
    keep(maxSummary);
  }

  // 7. Zero staff.
  {
    const date = "2026-12-12";
    const state = freshState({ date });
    const played = play(state, baseDecisions(state, { staffingLevel: 0 }), coldDay(date));
    const summary = summarize("zero-staff", played, profile);
    if (summary.visits !== 0) summary.problems.push("zero staff still moved skiers");
    if (!(summary.cost > 0)) summary.problems.push("zero staff erased fixed cost");
    keep(summary);
  }

  // Lean staffing on the powder weekend hurts satisfaction and throughput.
  {
    const date = "2026-12-12";
    const snow = 14 * E.cmPerInch;
    const surgeState = freshState({ date, lastSnowfallCm: snow });
    const leanState = freshState({ date, lastSnowfallCm: snow });
    const surge = play(
      surgeState,
      baseDecisions(surgeState, { staffingLevel: profile.maxHeadcount, groomingSchedule: "full" }),
      coldDay(date)
    );
    const leanStaff = Math.max(1, profile.standardHeadcount * 0.35);
    const lean = play(
      leanState,
      baseDecisions(leanState, { staffingLevel: leanStaff, groomingSchedule: "full" }),
      coldDay(date)
    );
    const summary = summarize("lean-staff-powder", lean, profile);
    summary.surgeSatisfaction = surge.result?.satisfaction ?? null;
    summary.surgeVisits = surge.result?.visits.total ?? null;
    if (!(summary.satisfaction < summary.surgeSatisfaction)) {
      summary.problems.push("lean staffing did not lower satisfaction");
    }
    if (!(summary.visits < summary.surgeVisits)) {
      summary.problems.push("lean staffing did not lower visits");
    }
    keep(summary);
  }

  // Snowmaking lag and a missed temperature window.
  {
    const budget = Math.min(
      profile.snowmakingBudgetMax,
      profile.acres * (40 / E.cmPerFoot) * E.snowmakingCostPerAf
    );
    const run = (firstMinC) => {
      let state = freshState({ depthCm: 0, date: "2026-12-07" });
      const day1 = state.calendar.currentDate;
      const first = play(
        state,
        baseDecisions(state, { snowmakingBudget: budget, staffingLevel: profile.standardHeadcount }),
        coldDay(day1, { tempMinC: firstMinC, tempAvgC: firstMinC, tempMaxC: firstMinC })
      );
      state = first.state;
      const day2 = state.calendar.currentDate;
      const second = play(
        state,
        baseDecisions(state, { snowmakingBudget: 0 }),
        coldDay(day2, { tempMinC: -10, tempAvgC: -6, tempMaxC: -2 })
      );
      return { first, second };
    };
    const early = run(-12);
    const late = run(4.4);
    const earlyDepth = early.second.result?.snow.depthEndCm ?? 0;
    const lateDepth = late.second.result?.snow.depthEndCm ?? 0;
    const sameDayDepth = early.first.result?.snow.depthEndCm ?? 0;
    const problems = [];
    if (!(sameDayDepth < E.openDepthCm)) problems.push("made snow arrived the same day");
    if (!(earlyDepth >= E.openDepthCm)) problems.push("cold-night snow was not ready the next day");
    if (!(lateDepth < earlyDepth)) problems.push("a warm night produced as much snow as a cold night");
    if (late.second.result?.snow.depthEndCm >= E.openDepthCm) {
      problems.push("late snowmaking still opened the mountain");
    }
    keep({
      id: "snowmaking-lag",
      ok: problems.length === 0,
      problems,
      earlyDepth,
      lateDepth,
      sameDayDepth,
      clamps: [
        ...(early.first.result?.clamps || []),
        ...(late.first.result?.clamps || []),
      ],
    });
  }

  // Grooming changes satisfaction and cost.
  {
    const date = "2026-12-08";
    const fullState = freshState({ date });
    const bareState = freshState({ date });
    const full = play(
      fullState,
      baseDecisions(fullState, { groomingSchedule: "full", staffingLevel: profile.maxHeadcount }),
      coldDay(date)
    );
    const bare = play(
      bareState,
      baseDecisions(bareState, { groomingSchedule: "none", staffingLevel: profile.maxHeadcount }),
      coldDay(date)
    );
    const summary = summarize("grooming", bare, profile);
    summary.fullSatisfaction = full.result?.satisfaction ?? null;
    summary.fullGroomingCost = full.result?.cost.grooming ?? null;
    if (!(summary.satisfaction < summary.fullSatisfaction)) summary.problems.push("ungroomed snow did not hurt satisfaction");
    if (!(summary.fullGroomingCost > bare.result.cost.grooming)) summary.problems.push("full grooming was not more expensive");
    keep(summary);
  }

  // Marketing diminishing returns.
  {
    const date = "2026-12-09";
    const at = (spend) => {
      const state = freshState({ date, seed: STRESS_SEED });
      return play(
        state,
        baseDecisions(state, {
          marketingSpend: spend,
          staffingLevel: profile.maxHeadcount,
          groomingSchedule: "full",
          liftTicketPrice: profile.fairDayPrice,
        }),
        coldDay(date, { tempAvgC: -5 })
      );
    };
    const none = at(0);
    const ref = at(profile.marketingReference);
    const doubled = at(Math.min(profile.marketingMax, profile.marketingReference * E.log2Base));
    const maxed = at(profile.marketingMax);
    const step1 = ref.result.visits.unconstrained - none.result.visits.unconstrained;
    const step2 = doubled.result.visits.unconstrained - ref.result.visits.unconstrained;
    const stepMax = maxed.result.visits.unconstrained - doubled.result.visits.unconstrained;
    const problems = [];
    if (!(ref.result.visits.unconstrained > none.result.visits.unconstrained)) {
      problems.push("reference marketing did not beat zero");
    }
    if (!(step2 <= step1 + 1e-6)) problems.push("second marketing step was not smaller");
    if (!(stepMax <= step2 + 1e-6)) problems.push("spend above two doublings did not diminish");
    keep({
      id: "marketing-diminishing",
      ok: problems.length === 0,
      problems,
      visitsNone: none.result.visits.unconstrained,
      visitsRef: ref.result.visits.unconstrained,
      visitsDouble: doubled.result.visits.unconstrained,
      visitsMax: maxed.result.visits.unconstrained,
      step1,
      step2,
      stepMax,
      clamps: [],
    });
  }

  // 8. Maximum everything, including the lodge bet.
  {
    const date = "2026-12-12";
    const state = freshState({ date, lastSnowfallCm: 14 * E.cmPerInch });
    const played = play(state, {
      liftTicketPrice: profile.decisionMax,
      snowmakingBudget: profile.snowmakingBudgetMax,
      groomingSchedule: "full",
      terrainOpen: ["beginner", "intermediate", "advanced"],
      staffingLevel: profile.maxHeadcount,
      marketingSpend: profile.marketingMax,
      bigBet: "lodge_upgrade",
    }, coldDay(date));
    const summary = summarize("maximum-everything", played, profile);
    if (!(summary.cost > summary.revenue)) summary.problems.push("maximum spend was not expensive");
    keep(summary);
  }

  // 9. 100-day autopilot. The API season is 84 days; this loop keeps going to look for drift.
  {
    let state = freshState({ depthCm: E.goodCoverInches * E.cmPerInch, date: SEASON_START });
    const problems = [];
    let minSat = E.satisfactionMax;
    let maxSat = E.satisfactionMin;
    let days = 0;
    for (let i = 0; i < 100; i += 1) {
      const date = state.calendar.currentDate;
      const phase = i % 10;
      let weather = coldDay(date);
      if (phase === 1 || phase === 7) {
        weather = coldDay(date, { snowfallCm: phase === 7 ? 20 * E.cmPerInch : 8 * E.cmPerInch });
      } else if (phase === 4) {
        weather = syntheticDay(date, {
          tempAvgC: 6,
          tempMinC: 2,
          tempMaxC: 9,
          humidity: null,
          rain: true,
          precipMm: 8,
          precipType: ["rain"],
        });
      } else if (phase === 5) {
        weather = syntheticDay(date, {
          tempAvgC: -8,
          tempMinC: -12,
          tempMaxC: -4,
          humidity: null,
          windKmh: 70 * E.kmPerMile,
          windGustKmh: 80 * E.kmPerMile,
        });
      } else if (phase === 9) {
        weather = coldDay(date, { tempAvgC: -28, tempMinC: -32, tempMaxC: -22 });
      }
      const suggested = suggestedDecisions(state, weather);
      const decisions = {
        ...suggested,
        snowmakingBudget: 0,
        bigBet: null,
        staffingLevel: Math.min(
          profile.maxHeadcount,
          profile.standardHeadcount
        ),
      };
      const played = resolveDay(state, decisions, weather, { ignoreSeasonCap: true });
      const found = sanityProblems(played.result, profile);
      if (found.length) problems.push(`day ${i}: ${found.join("; ")}`);
      minSat = Math.min(minSat, played.result.satisfaction);
      maxSat = Math.max(maxSat, played.result.satisfaction);
      state = played.state;
      days += 1;
      if (problems.length > 5) break;
    }
    keep({
      id: "autopilot-100",
      ok: problems.length === 0,
      problems,
      days,
      minSat,
      maxSat,
      finalDepth: state.snowDepthCm,
      finalProfit: state.seasonTotals.profit,
      clamps: [],
    });
  }

  // 10. Big-bet spam.
  {
    let state = freshState({ date: "2026-12-06" });
    let accepted = 0;
    let rejected = 0;
    const attempts = [
      "terrain_park",
      "terrain_park",
      "special_event",
      "special_event",
      "lodge_upgrade",
      "lodge_upgrade",
    ];
    for (const bet of attempts) {
      const decisions = baseDecisions(state, { bigBet: bet, groomingSchedule: "full" });
      const played = play(state, decisions, coldDay(state.calendar.currentDate));
      if (!played.ok) {
        rejected += 1;
        // Advance the day with a legal non-bet so cooldowns move forward in time.
        const skip = play(state, baseDecisions(state, { bigBet: null }), coldDay(state.calendar.currentDate));
        if (skip.ok) state = skip.state;
      } else {
        accepted += 1;
        state = played.state;
      }
    }
    const problems = [];
    if (accepted !== 3) problems.push(`accepted ${accepted}, expected 3`);
    if (rejected !== 3) problems.push(`rejected ${rejected}, expected 3`);
    if (!state.assets.terrainPark || !state.assets.lodgeUpgrade) problems.push("builds did not stick");
    keep({ id: "big-bet-spam", ok: problems.length === 0, problems, accepted, rejected, clamps: [] });
  }

  keep(anchorDay(profile));

  const sweep = parameterSweep(profile);

  const failed = scenarios.filter((scenario) => !scenario.ok || (scenario.problems || []).length);
  return {
    profile: {
      name: profile.name,
      region: profile.region,
      sizeClass: profile.sizeClass,
      acres: profile.acres,
      comfortableCapacity: profile.comfortableCapacity,
      avgDailyVisits: profile.avgDailyVisits,
      fairDayPrice: profile.fairDayPrice,
      marketAnchor: profile.marketAnchor,
      decisionMax: profile.decisionMax,
      revenuePerVisit: profile.revenuePerVisit,
      opexPerVisit: profile.opexPerVisit,
      meanWeight: profile.meanWeight,
    },
    scenarios,
    failed: failed.map((scenario) => ({ id: scenario.id, problems: scenario.problems })),
    clampsObserved,
    sweep,
  };
}

function parameterSweep(profile) {
  const date = "2026-12-12";
  const weathers = [
    { id: "weekday-bluebird", date: "2026-12-09", lastSnow: 0, depth: E.goodCoverInches * E.cmPerInch, weather: coldDay("2026-12-09") },
    { id: "weekend-bluebird", date, lastSnow: 0, depth: E.goodCoverInches * E.cmPerInch, weather: coldDay(date) },
    { id: "weekend-powder", date, lastSnow: 14 * E.cmPerInch, depth: E.goodCoverInches * E.cmPerInch, weather: coldDay(date) },
    { id: "weekend-thin", date, lastSnow: 0, depth: E.openDepthCm, weather: coldDay(date) },
    { id: "weekend-rain", date, lastSnow: 0, depth: E.goodCoverInches * E.cmPerInch, weather: syntheticDay(date, { tempAvgC: 5, tempMinC: 2, tempMaxC: 8, humidity: null, rain: true, precipMm: 10, precipType: ["rain"] }) },
  ];
  const prices = [0, profile.fairDayPrice, profile.marketAnchor, profile.decisionMax];
  const staffLevels = [0, profile.standardHeadcount * 0.5, profile.standardHeadcount, profile.maxHeadcount];
  const marketing = [0, profile.marketingReference, profile.marketingMax];
  const grooming = ["none", "full"];
  const bestByScenario = {};
  const wins = new Map();
  let cells = 0;
  let problems = 0;
  for (const scene of weathers) {
    let best = null;
    for (const price of prices) {
      for (const staff of staffLevels) {
        for (const spend of marketing) {
          for (const groom of grooming) {
            const state = freshState({
              date: scene.date,
              depthCm: scene.depth,
              lastSnowfallCm: scene.lastSnow,
              seed: STRESS_SEED,
            });
            const decisions = {
              liftTicketPrice: price,
              snowmakingBudget: 0,
              groomingSchedule: groom,
              terrainOpen: ["beginner", "intermediate", "advanced"],
              staffingLevel: staff,
              marketingSpend: spend,
              bigBet: null,
            };
            const played = play(state, decisions, { ...scene.weather, date: scene.date });
            cells += 1;
            if (!played.ok || sanityProblems(played.result, profile).length) {
              problems += 1;
              continue;
            }
            const key = JSON.stringify({
              price: Math.round(price * 100) / 100,
              staff: Math.round(staff * 100) / 100,
              spend: Math.round(spend * 100) / 100,
              groom,
            });
            const profit = played.result.profit;
            if (!best || profit > best.profit) best = { key, profit, price, staff, spend, groom, visits: played.result.visits.total };
          }
        }
      }
    }
    bestByScenario[scene.id] = best;
    if (best) wins.set(best.key, (wins.get(best.key) || 0) + 1);
  }
  let dominant = null;
  for (const [key, count] of wins) {
    if (count === weathers.length) dominant = key;
  }
  return { cells, problems, bestByScenario, dominant, scenarioCount: weathers.length };
}

function anchorDay(profile) {
  const date = "2026-12-09";
  const state = freshState({ date, profile });
  const played = play(
    state,
    baseDecisions(state, {
      liftTicketPrice: profile.fairDayPrice,
      groomingSchedule: "partial",
      marketingSpend: profile.marketingReference,
      staffingLevel: Math.min(
        profile.maxHeadcount,
        profile.workersPerVisit * profile.avgDailyVisits * (demandWeight(date) / profile.meanWeight)
      ),
    }),
    coldDay(date)
  );
  const summary = summarize("fair-price-weekday", played, profile);
  const visits = summary.visits || 0;
  summary.revenuePerVisit = visits > 0 ? summary.revenue / visits : null;
  summary.costPerVisit = visits > 0 ? summary.cost / visits : null;
  const rev = summary.revenuePerVisit;
  const cost = summary.costPerVisit;
  if (!(rev > profile.revenuePerVisit * 0.5 && rev < profile.revenuePerVisit * 2)) {
    summary.problems.push(`revenue/visit ${rev} outside 0.5-2x anchor ${profile.revenuePerVisit}`);
  }
  if (!(cost > profile.opexPerVisit * 0.4 && cost < profile.opexPerVisit * 2.5)) {
    summary.problems.push(`cost/visit ${cost} outside 0.4-2.5x anchor ${profile.opexPerVisit}`);
  }
  return summary;
}

export function scenarioLine(summary) {
  return [
    summary.id,
    summary.ok === false || (summary.problems || []).length ? "FAIL" : "ok",
    summary.visits != null ? `visits ${Math.round(summary.visits)}` : null,
    summary.profit != null ? `profit ${summary.profit}` : null,
    summary.satisfaction != null ? `sat ${summary.satisfaction.toFixed?.(1) ?? summary.satisfaction}` : null,
    (summary.problems || []).join("; "),
  ]
    .filter(Boolean)
    .join(" | ");
}
