import { addDays, demandWeight } from "./calendar.js";
import { BASE_ZONES, decisionBounds } from "./decisions.js";
import { E, clamp, money } from "./economics.config.js";
import { nextRng } from "./rng.js";
import { kmhToMph, snowmakingWindow } from "./weather.js";

function factor(id, delta, factors) {
  if (!Number.isFinite(delta) || delta === 0) return;
  factors.push({ id, delta });
}

function priceSatisfaction(price, profile) {
  const anchor = profile.marketAnchor;
  if (!(anchor > 0)) return 0;
  const gapPoints = (E.csatOverall - E.csatValueForPrice) * E.csatToHundred;
  const over = Math.max(0, price / anchor - 1);
  const under = Math.max(0, 1 - price / anchor);
  const penalty = Math.min(over, E.priceSatisfactionCap) * gapPoints;
  const bonus = Math.min(under, E.priceSatisfactionCap) * gapPoints * E.priceSatisfactionBonusRatio;
  return bonus - penalty;
}

function thinDayMultiplier(depthCm) {
  const goodCm = E.goodCoverInches * E.cmPerInch;
  if (depthCm >= goodCm) return 1;
  if (depthCm <= E.openDepthCm) return E.dayTicketThinMultiplier;
  const span = goodCm - E.openDepthCm;
  const t = span === 0 ? 1 : (goodCm - depthCm) / span;
  return 1 + t * (E.dayTicketThinMultiplier - 1);
}

function marketingMultiplier(spend, reference) {
  if (!(reference > 0)) return 1;
  const floorSpend = reference * E.marketingFloorRatio;
  const effective = spend <= 0 ? floorSpend : Math.max(spend, floorSpend);
  const doublings = Math.log(effective / reference) / Math.log(E.log2Base);
  return 1 + E.marketingUpliftPerDoubling * doublings;
}

function groomFraction(schedule) {
  if (schedule === "full") return 1;
  if (schedule === "partial") return E.groomingPartialFraction;
  return 0;
}

export function createInitialState({
  profile,
  startDate,
  seed,
  userId,
  initialDepthCm = 0,
}) {
  const depth = Math.max(0, Number(initialDepthCm) || 0);
  return {
    schemaVersion: E.schemaVersion,
    gameId: null,
    userId: userId == null ? null : String(userId),
    seed: seed >>> 0,
    rngState: seed >>> 0,
    profile,
    calendar: {
      seasonStart: startDate,
      seasonEnd: profile.seasonEnd,
      primeWeeks: E.primeWeeks,
      dayIndex: 0,
      daysInSeason: E.seasonDays,
      currentDate: startDate,
      status: "awaiting_decisions",
    },
    snowDepthCm: depth,
    pendingSnow: [],
    lastSnowfallCm: 0,
    assets: { terrainPark: false, lodgeUpgrade: false },
    cooldowns: { terrain_park: null, lodge_upgrade: null, special_event: null },
    equipment: {
      liftsDown: 0,
      breakdown: false,
      downtimeProbability: E.equipmentBaselineDowntime,
      operational: true,
    },
    seasonTotals: {
      revenue: 0,
      cost: 0,
      profit: 0,
      visits: 0,
      dayVisits: 0,
      passVisits: 0,
      otherVisits: 0,
    },
    satisfaction: { latest: null, seasonMean: null, samples: 0, sum: 0 },
    lastResult: null,
  };
}

export function suggestedDecisions(state, weather) {
  const bounds = decisionBounds(state);
  const weight = demandWeight(weather?.date || state.calendar.currentDate);
  const scale = state.profile.meanWeight > 0 ? weight / state.profile.meanWeight : 1;
  let staff = state.profile.standardHeadcount * scale;
  const inches = state.lastSnowfallCm / E.cmPerInch;
  if (inches >= E.powderDeepInches) staff *= 1 + E.powderUpliftDeep;
  else if (inches >= E.powderModerateInches) staff *= 1 + E.powderUpliftModerate;
  staff = clamp(staff, bounds.staffingLevel.min, bounds.staffingLevel.max);
  return {
    liftTicketPrice: bounds.liftTicketPrice.anchor,
    snowmakingBudget: 0,
    groomingSchedule: "partial",
    terrainOpen: [...bounds.terrainOpen.allowed],
    staffingLevel: staff,
    marketingSpend: Math.min(bounds.marketingSpend.reference, bounds.marketingSpend.max),
    bigBet: null,
  };
}

export function resolveDay(state, decisions, weather, options = {}) {
  if (state.calendar.status === "closed" && !options.ignoreSeasonCap) {
    return { ok: false, error: "season_closed", state, result: null };
  }
  const next = structuredClone(state);
  const clamps = [];
  const factors = [];
  const impacts = [];
  const notes = [];
  const date = weather?.date || next.calendar.currentDate;

  if (weather?.source === "missing") {
    impacts.push("forecast_missing");
    notes.push(weather.reason || "forecast_missing");
  }

  let depth = next.snowDepthCm;
  let madeAdded = 0;
  const stillPending = [];
  for (const job of next.pendingSnow) {
    if (job.availableOn <= date) {
      madeAdded += job.depthCm;
      depth += job.depthCm;
    } else {
      stillPending.push(job);
    }
  }

  const naturalAdded = Math.max(0, weather?.snowfallCm || 0);
  depth += naturalAdded;

  let melt = 0;
  const tempAvg = weather?.tempAvgC;
  if (tempAvg != null && tempAvg > E.freezingC) {
    melt += (tempAvg - E.freezingC) * E.meltCmPerDegree;
    if (weather.rain && weather.precipMm > 0) {
      melt += (weather.precipMm / E.mmPerCm) * E.rainMeltRatio;
    }
  }
  if (depth - melt < 0) {
    melt = depth;
    clamps.push("snow_depth");
  }
  depth = Math.max(0, depth - melt);

  const previousInches = next.lastSnowfallCm / E.cmPerInch;
  let powderUplift = 0;
  if (previousInches >= E.powderDeepInches) {
    powderUplift = E.powderUpliftDeep;
    impacts.push("powder_followthrough");
  } else if (previousInches >= E.powderModerateInches) {
    powderUplift = E.powderUpliftModerate;
    impacts.push("powder_followthrough");
  }

  let tempPenalty = 0;
  if (tempAvg != null) {
    if (tempAvg < E.tempCold25C) tempPenalty = E.tempPenalty25;
    else if (tempAvg < E.tempCold20C) tempPenalty = E.tempPenalty20;
    else if (tempAvg < E.tempCold15C) tempPenalty = E.tempPenalty15;
    else if (tempAvg > E.tempHot15C) tempPenalty = E.tempPenaltyHot;
    if (tempPenalty) impacts.push("temperature");
  }
  if (weather?.rain) impacts.push("rain");

  const sustainedMph = kmhToMph(weather?.windKmh);
  const gustMph = kmhToMph(weather?.windGustKmh);
  const windHold =
    (sustainedMph != null && sustainedMph >= E.windHoldSustainedMph) ||
    (gustMph != null && gustMph >= E.windHoldGustMph);
  if (windHold) impacts.push("wind_hold");

  const window = snowmakingWindow(weather || {});
  impacts.push(window.open ? "snowmaking_window_open" : "snowmaking_window_closed");

  const parkAlready = next.assets.terrainPark;
  const zoneCount = parkAlready ? BASE_ZONES.length + 1 : BASE_ZONES.length;
  const requested = new Set(decisions.terrainOpen || []);
  const depthOk = depth >= E.openDepthCm;
  const forcedClosed = [];
  let openCount = 0;
  for (const zone of BASE_ZONES) {
    if (!requested.has(zone)) continue;
    if (!depthOk) forcedClosed.push(zone);
    else openCount += 1;
  }
  if (requested.has("terrain_park")) {
    if (!parkAlready) notes.push("Terrain park is not built");
    else if (!depthOk) forcedClosed.push("terrain_park");
    else openCount += 1;
  }
  if (forcedClosed.length) {
    impacts.push("thin_cover_forced_close");
    notes.push(`Closed for thin cover: ${forcedClosed.join(", ")}`);
  }
  const openFraction = zoneCount > 0 ? openCount / zoneCount : 0;

  const eventToday = decisions.bigBet === "special_event";
  const parkOpen = parkAlready && requested.has("terrain_park") && depthOk;
  const eventMult = eventToday ? 1 + E.bigBetUplift.event_visits : 1;
  const parkMult = parkOpen ? 1 + E.bigBetUplift.terrain_park_visits : 1;
  const marketingMult = marketingMultiplier(decisions.marketingSpend, next.profile.marketingReference);
  const weatherMult =
    (1 + tempPenalty) *
    (weather?.rain ? 1 - E.rainVisitReduction : 1) *
    (1 + powderUplift) *
    marketingMult *
    eventMult *
    parkMult;

  const weight = demandWeight(date);
  const base =
    next.profile.meanWeight > 0
      ? next.profile.avgDailyVisits * (weight / next.profile.meanWeight)
      : next.profile.avgDailyVisits;
  const fair = next.profile.fairDayPrice;
  const ratio = fair > 0 ? Math.max(E.priceRatioFloor, decisions.liftTicketPrice / fair) : 1;
  const dayMult = ratio ** E.dayTicketElasticity;
  const passMult = ratio ** E.passPriceElasticity;
  const thinMult = thinDayMultiplier(depth);

  let dayUnc = base * weatherMult * E.dayVisitShare * dayMult * thinMult;
  let passUnc = base * weatherMult * E.passVisitShare * passMult;
  let otherUnc = base * weatherMult * E.otherVisitShare;
  for (const value of [dayUnc, passUnc, otherUnc]) {
    if (!Number.isFinite(value)) {
      dayUnc = 0;
      passUnc = 0;
      otherUnc = 0;
      clamps.push("visits_nan");
      break;
    }
  }
  dayUnc = Math.max(0, dayUnc);
  passUnc = Math.max(0, passUnc);
  otherUnc = Math.max(0, otherUnc);
  const unconstrained = dayUnc + passUnc + otherUnc;

  const groomed = groomFraction(decisions.groomingSchedule);
  const deferred =
    decisions.groomingSchedule === "none" ||
    decisions.staffingLevel < next.profile.guaranteedHeadcount
      ? E.equipmentDeferredHigh
      : decisions.groomingSchedule === "partial"
        ? E.equipmentDeferredLow
        : 1;
  const downtimeProbability = Math.min(1, E.equipmentBaselineDowntime * deferred);
  const roll = nextRng(next);
  const lifts = Math.max(1, next.profile.lifts);
  const breakdown = roll < downtimeProbability;
  const liftsDown = breakdown ? 1 : 0;
  const equipmentFactor = breakdown ? (lifts - liftsDown) / lifts : 1;
  if (breakdown) impacts.push("equipment_breakdown");

  const staffCap =
    decisions.staffingLevel <= 0 ? 0 : decisions.staffingLevel / next.profile.workersPerVisit;
  const terrainCap = next.profile.comfortableCapacity * openFraction * equipmentFactor;
  let cap = Math.min(terrainCap, staffCap);
  if (windHold) cap = 0;
  if (!Number.isFinite(cap) || cap < 0) {
    cap = 0;
    clamps.push("capacity");
  }

  let dayVisits = dayUnc;
  let passVisits = passUnc;
  let otherVisits = otherUnc;
  let cappedBy = null;
  if (unconstrained > cap) {
    const scale = unconstrained > 0 ? cap / unconstrained : 0;
    dayVisits *= scale;
    passVisits *= scale;
    otherVisits *= scale;
    if (windHold) cappedBy = "wind_hold";
    else if (staffCap <= terrainCap) cappedBy = staffCap < terrainCap ? "staff" : "capacity";
    else cappedBy = openFraction < 1 || breakdown ? "terrain" : "capacity";
  }
  let visits = dayVisits + passVisits + otherVisits;
  if (visits > next.profile.comfortableCapacity) {
    const scale = next.profile.comfortableCapacity / visits;
    dayVisits *= scale;
    passVisits *= scale;
    otherVisits *= scale;
    visits = dayVisits + passVisits + otherVisits;
    clamps.push("capacity");
    cappedBy = cappedBy || "capacity";
  }
  if (visits < 0) {
    dayVisits = 0;
    passVisits = 0;
    otherVisits = 0;
    visits = 0;
    clamps.push("visits");
  }

  const baselineSat = E.csatOverall * E.csatToHundred;
  let satisfaction = baselineSat;
  if (openCount > 0) {
    const delta = -(1 - groomed) * E.groomingSatisfactionPenalty;
    satisfaction += delta;
    factor("grooming", delta, factors);
  }
  const staffedFor = staffCap;
  if (unconstrained > 0 && staffedFor < unconstrained) {
    const shortfall = (unconstrained - staffedFor) / unconstrained;
    const delta = -(shortfall / E.staffShortfallStep) * E.staffCsatPerTenth * E.csatToHundred;
    satisfaction += delta;
    factor("staff_shortfall", delta, factors);
  }
  const priceDelta = priceSatisfaction(decisions.liftTicketPrice, next.profile);
  satisfaction += priceDelta;
  factor("price", priceDelta, factors);
  if (visits > 0 && next.profile.comfortableCapacity > 0) {
    const load = visits / next.profile.comfortableCapacity;
    if (load > E.crowdingStart) {
      const span = 1 - E.crowdingStart;
      const t = span === 0 ? 1 : Math.min(1, (load - E.crowdingStart) / span);
      const delta = -t * E.crowdingPenalty;
      satisfaction += delta;
      factor("crowding", delta, factors);
    }
  }
  const goodCm = E.goodCoverInches * E.cmPerInch;
  if (depth < goodCm) {
    const span = goodCm - E.openDepthCm;
    const t = depth <= E.openDepthCm || span === 0 ? 1 : (goodCm - depth) / span;
    const delta = -t * E.thinCoverSatisfaction;
    satisfaction += delta;
    factor("thin_cover", delta, factors);
  }
  if (weather?.rain) {
    const delta = -E.rainVisitReduction * E.percentScale;
    satisfaction += delta;
    factor("rain", delta, factors);
  }
  if (tempPenalty) {
    const delta = tempPenalty * E.percentScale;
    satisfaction += delta;
    factor("temperature", delta, factors);
  }
  if (windHold) {
    const delta = -E.windHoldSatisfaction;
    satisfaction += delta;
    factor("wind_hold", delta, factors);
  }
  if (depthOk) {
    const openable = zoneCount;
    const closedShare = openable > 0 ? (openable - openCount) / openable : 0;
    const delta = -closedShare * E.terrainClosedPenalty;
    satisfaction += delta;
    factor("terrain_closed", delta, factors);
  }
  if (breakdown) {
    const delta = -E.equipmentBreakdownSatisfaction;
    satisfaction += delta;
    factor("equipment", delta, factors);
  }
  if (parkOpen) {
    satisfaction += E.bigBetUplift.terrain_park_satisfaction;
    factor("terrain_park", E.bigBetUplift.terrain_park_satisfaction, factors);
  }
  if (next.assets.lodgeUpgrade) {
    satisfaction += E.bigBetUplift.lodge_satisfaction;
    factor("lodge", E.bigBetUplift.lodge_satisfaction, factors);
  }
  if (eventToday) {
    satisfaction += E.bigBetUplift.event_satisfaction;
    factor("special_event", E.bigBetUplift.event_satisfaction, factors);
  }
  if (satisfaction < E.satisfactionMin || satisfaction > E.satisfactionMax) clamps.push("satisfaction");
  satisfaction = clamp(satisfaction, E.satisfactionMin, E.satisfactionMax);
  if (!Number.isFinite(satisfaction)) {
    satisfaction = baselineSat;
    clamps.push("satisfaction");
  }

  const dayLift = money(dayVisits * decisions.liftTicketPrice);
  const passLift = money(passVisits * next.profile.passYield);
  const otherLift = money(otherVisits * E.otherPaidFraction * next.profile.passYield);
  const lift = money(dayLift + passLift + otherLift);
  const satRatio = baselineSat > 0 ? satisfaction / baselineSat : 0;
  const ancillaryPool =
    visits * (1 - E.liftRevenueShare) * next.profile.revenuePerVisit * satRatio;
  const nonLift =
    E.skiSchoolRevenueShare +
    E.diningRevenueShare +
    E.retailRevenueShare +
    E.otherRevenueShare;
  const lodgeAnc = next.assets.lodgeUpgrade ? 1 + E.bigBetUplift.lodge_ancillary : 1;
  const skiSchool = money(nonLift > 0 ? ancillaryPool * (E.skiSchoolRevenueShare / nonLift) : 0);
  const dining = money(
    nonLift > 0 ? ancillaryPool * (E.diningRevenueShare / nonLift) * lodgeAnc : 0
  );
  const retailRental = money(
    nonLift > 0 ? ancillaryPool * (E.retailRevenueShare / nonLift) * lodgeAnc : 0
  );
  const otherRevenue = money(nonLift > 0 ? ancillaryPool * (E.otherRevenueShare / nonLift) : 0);
  const revenueTotal = money(lift + skiSchool + dining + retailRental + otherRevenue);

  const labor = money(
    next.profile.guaranteedLaborCost +
      Math.max(0, decisions.staffingLevel - next.profile.guaranteedHeadcount) *
        next.profile.laborDayRate
  );
  const snowSpent = money(decisions.snowmakingBudget * window.efficiency);
  const acreFeet = E.snowmakingCostPerAf > 0 ? snowSpent / E.snowmakingCostPerAf : 0;
  let queuedCm = next.profile.acres > 0 ? (acreFeet / next.profile.acres) * E.cmPerFoot : 0;
  if (parkAlready) queuedCm *= 1 - E.parkSnowmakingShare;
  if (!Number.isFinite(queuedCm) || queuedCm < 0) {
    queuedCm = 0;
    clamps.push("snowmaking");
  }
  const availableOn = addDays(date, E.snowmakingLagDays);
  if (queuedCm > 0) stillPending.push({ availableOn, depthCm: queuedCm });

  const openAcres = next.profile.acres * openFraction;
  const grooming = money(
    (openAcres * groomed / E.groomingAcresPerHour) * E.groomingCostPerHour
  );
  const marketing = money(Math.max(0, decisions.marketingSpend));
  const bigBetCost = money(decisions.bigBet ? E.bigBetCost[decisions.bigBet] || 0 : 0);
  const fixedBase = money(Math.max(0, next.profile.otherFixedPerDay));
  const costTotal = money(fixedBase + labor + snowSpent + grooming + marketing + bigBetCost);
  const profit = money(revenueTotal - costTotal);

  if (decisions.bigBet === "terrain_park") {
    next.assets.terrainPark = true;
    next.cooldowns.terrain_park = addDays(next.calendar.seasonStart, E.seasonDays);
  } else if (decisions.bigBet === "lodge_upgrade") {
    next.assets.lodgeUpgrade = true;
    next.cooldowns.lodge_upgrade = addDays(next.calendar.seasonStart, E.seasonDays);
  } else if (decisions.bigBet === "special_event") {
    next.cooldowns.special_event = addDays(date, E.eventCooldownDays);
  }

  next.snowDepthCm = depth;
  next.pendingSnow = stillPending;
  next.lastSnowfallCm = naturalAdded;
  next.equipment = {
    liftsDown,
    breakdown,
    downtimeProbability,
    operational: !windHold && openCount > 0 && decisions.staffingLevel > 0,
  };
  next.seasonTotals.revenue = money(next.seasonTotals.revenue + revenueTotal);
  next.seasonTotals.cost = money(next.seasonTotals.cost + costTotal);
  next.seasonTotals.profit = money(next.seasonTotals.revenue - next.seasonTotals.cost);
  next.seasonTotals.visits += visits;
  next.seasonTotals.dayVisits += dayVisits;
  next.seasonTotals.passVisits += passVisits;
  next.seasonTotals.otherVisits += otherVisits;
  next.satisfaction.samples += 1;
  next.satisfaction.sum += satisfaction;
  next.satisfaction.latest = satisfaction;
  next.satisfaction.seasonMean = next.satisfaction.sum / next.satisfaction.samples;

  const result = {
    date,
    dayIndex: next.calendar.dayIndex,
    decisions,
    weather: {
      source: weather?.source || "missing",
      reason: weather?.reason || null,
      snowfallCm: naturalAdded,
      tempAvgC: tempAvg ?? null,
      tempMinC: weather?.tempMinC ?? null,
      tempMaxC: weather?.tempMaxC ?? null,
      windMph: sustainedMph,
      windGustMph: gustMph,
      precipType: weather?.precipType || [],
      rain: Boolean(weather?.rain),
      impacts,
    },
    visits: {
      total: visits,
      dayTicket: dayVisits,
      pass: passVisits,
      other: otherVisits,
      unconstrained,
      cappedBy,
    },
    revenue: {
      total: revenueTotal,
      bySource: { lift, skiSchool, dining, retailRental, other: otherRevenue },
      liftDetail: { dayTicket: dayLift, passAndFrequency: money(passLift + otherLift) },
    },
    cost: {
      total: costTotal,
      fixedBase,
      labor,
      snowmaking: snowSpent,
      grooming,
      marketing,
      bigBet: bigBetCost,
    },
    profit,
    satisfaction,
    satisfactionFactors: factors,
    snow: {
      depthStartCm: state.snowDepthCm,
      naturalAddedCm: naturalAdded,
      madeAddedCm: madeAdded,
      meltCm: melt,
      depthEndCm: depth,
      queuedCm,
      queuedFor: queuedCm > 0 ? availableOn : null,
      snowmakingEfficiency: window.efficiency,
      snowmakingWetBulbF: window.wetBulbF,
      snowmakingMethod: window.method,
    },
    equipment: next.equipment,
    terrain: { openFraction, forcedClosed, openCount },
    notes,
    clamps,
  };

  next.calendar.dayIndex += 1;
  const seasonOver = next.calendar.dayIndex >= E.seasonDays && !options.ignoreSeasonCap;
  if (seasonOver) {
    next.calendar.status = "closed";
    next.calendar.currentDate = null;
  } else {
    next.calendar.status = "awaiting_decisions";
    next.calendar.currentDate = addDays(date, 1);
  }
  next.lastResult = result;
  return { ok: true, error: null, state: next, result };
}

export function publicState(state, extras = {}) {
  const profile = state.profile;
  return {
    gameId: state.gameId,
    schemaVersion: state.schemaVersion,
    userId: state.userId,
    resort: {
      powalertResortId: profile.powalertResortId,
      name: profile.name,
      state: profile.state,
      region: profile.region,
      sizeClass: profile.sizeClass,
      sizeSource: profile.sizeSource,
      acres: profile.acres,
      acresSource: profile.acresSource,
      trails: profile.trails,
      lifts: profile.lifts,
      comfortableCapacity: profile.comfortableCapacity,
      marketTicket: {
        min: profile.marketMin,
        anchor: profile.marketAnchor,
        max: profile.marketMax,
        decisionMin: profile.decisionMin,
        decisionMax: profile.decisionMax,
        currency: "USD",
        windowSource: profile.source,
      },
      fairDayPrice: profile.fairDayPrice,
      revenuePerVisitAnchor: profile.revenuePerVisit,
      opexPerVisitAnchor: profile.opexPerVisit,
    },
    calendar: {
      seasonStart: state.calendar.seasonStart,
      seasonEnd: state.calendar.seasonEnd,
      primeWeeks: state.calendar.primeWeeks,
      dayIndex: state.calendar.dayIndex,
      daysInSeason: state.calendar.daysInSeason,
      currentDate: state.calendar.currentDate,
      status: state.calendar.status,
    },
    conditions: {
      snowDepthCm: state.snowDepthCm,
      snowDepthIn: state.snowDepthCm / E.cmPerInch,
      pendingSnowmaking: state.pendingSnow,
      equipment: state.equipment,
      assets: state.assets,
      cooldowns: state.cooldowns,
    },
    seasonTotals: {
      revenue: money(state.seasonTotals.revenue),
      cost: money(state.seasonTotals.cost),
      profit: money(state.seasonTotals.profit),
      visits: state.seasonTotals.visits,
      dayVisits: state.seasonTotals.dayVisits,
      passVisits: state.seasonTotals.passVisits,
      otherVisits: state.seasonTotals.otherVisits,
    },
    satisfaction: {
      latest: state.satisfaction.latest,
      seasonMean: state.satisfaction.seasonMean,
    },
    bounds: state.calendar.status === "closed" ? null : decisionBounds(state),
    prefill:
      state.calendar.status === "closed"
        ? null
        : extras.prefill ?? null,
    forecast: extras.forecast ?? [],
    lastResult: state.lastResult,
    seed: state.seed,
  };
}
